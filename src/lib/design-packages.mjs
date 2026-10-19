// Package inspection never imports contributed JavaScript or Astro source.
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, mkdtempSync, realpathSync } from "node:fs";
import { resolve, join, dirname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { designId, packagePath, designManifestSchema, assertCompatibility, validateOptions, builtinLayouts, emptyOptions } from "./design-manifest.mjs";
import { themeSchema } from "./theme-schema.mjs";

const require = createRequire(import.meta.url);
export const engineVersions = (root) => ({ astro: require("astro/package.json").version, libcard: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cleanPath = (p) => packagePath.parse(p).replace(/^\.\//, "");
const forbidden = new Set(["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "libcard.config.yaml"]);

/** Reject symlinks in EVERY ancestor, including the managed parent directory. */
export function safePath(root, path = "") {
  const base = resolve(root);
  const target = resolve(base, path);
  if (target !== base && !target.startsWith(base + sep)) throw new Error(`Path escapes package: ${path}`);
  let cursor = target;
  while (true) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlinks are not supported: ${cursor}`);
    // existsSync follows dangling links; lstat catches those too.
    try { if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlinks are not supported: ${cursor}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return target;
}

export function packageFiles(dir) {
  safePath(dir);
  const walk = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    // Git metadata is never copied, hashed, or executed.
    if (folder === dir && entry.name === ".git") return [];
    const full = safePath(dir, relative(dir, join(folder, entry.name)));
    if (entry.isDirectory()) return walk(full);
    if (!entry.isFile()) throw new Error(`Unsupported file: ${full}`);
    return [relative(dir, full).split(sep).join("/")];
  });
  return walk(dir).sort();
}

export function inspectPackage(dir, versions) {
  dir = resolve(dir);
  const actual = packageFiles(dir);
  const manifest = designManifestSchema.parse(parse(readFileSync(safePath(dir, "design.yaml"), "utf8")));
  assertCompatibility(manifest, versions);
  const files = ["design.yaml", ...manifest.files.map(cleanPath)].sort();
  if (new Set(files).size !== files.length) throw new Error(`${manifest.id}: duplicate files (design.yaml is included automatically)`);
  for (const file of files) {
    if (forbidden.has(file.split("/").at(-1))) throw new Error(`${manifest.id}: ${file} is not allowed; packages are self-contained and cannot install dependencies or contain owner config`);
    const path = safePath(dir, file);
    if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`${manifest.id}: missing file ${file}`);
  }
  // Prevent unlisted source, hooks, or secrets from entering an exported release.
  const extra = actual.filter((file) => !files.includes(file));
  if (extra.length) throw new Error(`${manifest.id}: unlisted files: ${extra.join(", ")}. Add design-owned files to the manifest or remove them.`);
  for (const file of [manifest.layout.entry, manifest.layout.optionsSchema, manifest.appearance?.file, ...Object.values(manifest.previews ?? {}), "LICENSE", "README.md"].filter(Boolean)) {
    if (!files.includes(cleanPath(file))) throw new Error(`${manifest.id}: required file ${file} must be listed in files`);
  }
  const size = files.reduce((total, file) => total + lstatSync(safePath(dir, file)).size, 0);
  if (size > 25 * 1024 * 1024) throw new Error(`${manifest.id}: package exceeds 25 MiB`);
  const optionsSchema = manifest.layout.optionsSchema
    ? JSON.parse(readFileSync(safePath(dir, cleanPath(manifest.layout.optionsSchema)), "utf8"))
    : builtinLayouts[manifest.layout.use]?.optionsSchema ?? emptyOptions;
  validateOptions(optionsSchema, manifest.defaults, `${manifest.id} defaults`);
  const appearance = manifest.appearance?.file
    ? themeSchema.parse(parse(readFileSync(safePath(dir, cleanPath(manifest.appearance.file)), "utf8"))) : null;
  const hash = createHash("sha256");
  for (const file of files) {
    const bytes = readFileSync(safePath(dir, file));
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  return { dir, manifest, files, optionsSchema, appearance, integrity: hash.digest("hex") };
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.union([
  z.object({ kind: z.literal("git"), url: z.string(), ref: z.string(), commit: z.string().regex(/^[a-f0-9]{40}$/) }).strict(),
  z.object({ kind: z.literal("directory"), path: z.string() }).strict(),
]);
const recordSchema = z.object({ id: designId, version: z.string(), integrity: digest, source: sourceSchema }).strict();
const lockSchema = z.object({ version: z.literal(1), packages: z.array(recordSchema.extend({ history: z.array(recordSchema).default([]) })) }).strict();
export function readDesignLock(root) {
  const file = safePath(root, "designs.lock.yaml");
  const lock = existsSync(file) ? lockSchema.parse(parse(readFileSync(file, "utf8"))) : { version: 1, packages: [] };
  if (new Set(lock.packages.map((p) => p.id)).size !== lock.packages.length) throw new Error("Duplicate IDs in designs.lock.yaml");
  return lock;
}

export function discoverPackages(root, versions = engineVersions(root)) {
  const result = ["local", "installed"].flatMap((kind) => {
    const base = safePath(root, `designs/${kind}`);
    if (!existsSync(base)) return [];
    return readdirSync(base).flatMap((author) => {
      const namespace = safePath(base, author);
      if (!lstatSync(namespace).isDirectory()) throw new Error(`Expected author directory: ${namespace}`);
      return readdirSync(namespace).map((name) => {
        const pkg = inspectPackage(safePath(namespace, name), versions);
        if (pkg.manifest.id !== `${author}/${name}`) throw new Error(`Package ID ${pkg.manifest.id} must match designs/${kind}/${author}/${name}`);
        return { ...pkg, kind };
      });
    });
  });
  const ids = result.map((p) => p.manifest.id);
  if (new Set(ids).size !== ids.length) throw new Error("Conflicting design IDs in local and installed packages; fork under a new author/name");
  const lock = readDesignLock(root);
  for (const pkg of result.filter((p) => p.kind === "installed")) {
    const record = lock.packages.find((p) => p.id === pkg.manifest.id);
    if (!record || record.integrity !== pkg.integrity || record.version !== pkg.manifest.version) throw new Error(`${pkg.manifest.id}: installed files differ from designs.lock.yaml. Restore them or use design:fork to preserve edits as a local design.`);
  }
  for (const record of lock.packages) if (!result.some((p) => p.manifest.id === record.id && p.kind === "installed")) throw new Error(`${record.id}: locked package is missing`);
  return result;
}

export const appearanceKey = (id) => `design-${sha(id).slice(0, 20)}`;
export function packageCatalog(packages) {
  return packages.map(({ manifest: m, optionsSchema }) => ({
    id: m.id, name: m.name, version: m.version, layout: m.layout.use ?? m.id,
    theme: m.appearance?.file ? appearanceKey(m.id) : m.appearance?.use ?? "default",
    defaults: m.defaults, optionsSchema, builtin: false,
    credit: { name: m.name, author: m.author, authorUrl: m.authorUrl, license: m.license, source: m.source },
    capabilities: m.capabilities,
  }));
}

export function copyPackage(pkg, destination) {
  if (existsSync(safePath(destination))) throw new Error(`Destination already exists: ${destination}`);
  for (const file of pkg.files) {
    const target = safePath(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(safePath(pkg.dir, file)));
  }
}

const git = (cwd, args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "-c", "protocol.file.allow=always", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
export function fetchPackage(source, ref, versions) {
  if (!ref) {
    if (/^[a-z]+:/i.test(source)) throw new Error("Remote packages require --ref=v1.2.3 or an exact 40-character commit");
    const path = resolve(source);
    return { pkg: inspectPackage(path, versions), source: { kind: "directory", path }, cleanup: () => {} };
  }
  if (!/^(?:v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?|[a-f0-9]{40})$/.test(ref)) throw new Error("Use a version tag or an exact 40-character commit, not a branch");
  const url = /^https:\/\//.test(source) ? source : resolve(source);
  if (/^[a-z]+:/i.test(source) && !/^https:\/\//.test(source)) throw new Error("Only HTTPS Git URLs or local Git repositories are supported");
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), "libcard-design-"));
  try {
    git(scratch, ["clone", "--quiet", "--no-checkout", "--no-local", "--", url, "repo"]);
    const repo = join(scratch, "repo");
    const revision = /^[a-f0-9]{40}$/.test(ref) ? ref : `refs/tags/${ref}`;
    const commit = git(repo, ["rev-parse", "--verify", `${revision}^{commit}`]);
    const tree = git(repo, ["ls-tree", "-r", commit]);
    if (tree.split("\n").some((line) => /^(120000|160000) /.test(line))) throw new Error("Symlinks and submodules are not supported in design packages");
    // No checkout: git attributes, filters, hooks and package scripts never run.
    const output = join(scratch, "package");
    mkdirSync(output);
    const names = execFileSync("git", ["-C", repo, "ls-tree", "-rz", "--name-only", commit], { encoding: "utf8" }).split("\0").filter(Boolean);
    for (const name of names) {
      const file = cleanPath(name);
      const target = safePath(output, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, execFileSync("git", ["-C", repo, "show", `${commit}:${name}`], { maxBuffer: 26 * 1024 * 1024 }));
    }
    return { pkg: inspectPackage(output, versions), source: { kind: "git", url, ref, commit }, cleanup: () => rmSync(scratch, { recursive: true, force: true }) };
  } catch (error) { rmSync(scratch, { recursive: true, force: true }); throw error; }
}

/** Commit one package and lock together; restore the previous source on failure.
 * @param {string} root @param {any} fetched
 * @param {{ update?: boolean, integrity?: string }} options
 */
export function installPackage(root, fetched, { update = false, integrity } = {}) {
  const { pkg, source } = fetched;
  const id = pkg.manifest.id;
  if (integrity && digest.parse(integrity) !== pkg.integrity) throw new Error(`${id}: integrity mismatch`);
  const lock = readDesignLock(root);
  const previous = lock.packages.find((p) => p.id === id);
  const target = safePath(root, `designs/installed/${id}`);
  if (existsSync(safePath(root, `designs/local/${id}`))) throw new Error(`${id}: a local design already owns this ID`);
  if (!update && (previous || existsSync(target))) throw new Error(`${id}: already installed; use design:update`);
  if (update && !previous) throw new Error(`${id}: not installed`);
  if (previous) {
    const current = inspectPackage(target, engineVersions(root));
    if (current.integrity !== previous.integrity) throw new Error(`${id}: local edits detected; use design:fork before updating`);
    if (previous.source.kind === "git" && source.kind === "git" && previous.source.url === source.url && previous.source.ref === source.ref && previous.source.commit !== source.commit) throw new Error(`${id}: tag ${source.ref} moved; choose a new version or an exact commit`);
  }
  const history = previous ? [{ id: previous.id, version: previous.version, integrity: previous.integrity, source: previous.source }, ...previous.history] : [];
  const record = { id, version: pkg.manifest.version, integrity: pkg.integrity, source, history };
  const next = { version: 1, packages: [...lock.packages.filter((p) => p.id !== id), record].sort((a, b) => a.id.localeCompare(b.id)) };
  const stageRoot = safePath(root, "designs/.staging");
  if (existsSync(stageRoot)) throw new Error("An interrupted design operation exists at designs/.staging; inspect it before retrying");
  mkdirSync(stageRoot, { recursive: true });
  const stage = join(stageRoot, "package");
  let moved = false;
  let applied = false;
  try {
    copyPackage(pkg, stage);
    const staged = inspectPackage(stage, engineVersions(root));
    if (staged.integrity !== pkg.integrity) throw new Error("Package changed while copying");
    writeFileSync(join(stageRoot, "lock.yaml"), stringify(next));
    if (previous) { renameSync(target, join(stageRoot, "previous")); moved = true; }
    mkdirSync(dirname(target), { recursive: true });
    renameSync(stage, target); applied = true;
    if (previous) {
      const archive = safePath(root, `designs/history/${id}/${previous.integrity}`);
      if (!existsSync(archive)) copyPackage(inspectPackage(join(stageRoot, "previous"), engineVersions(root)), archive);
    }
    renameSync(join(stageRoot, "lock.yaml"), safePath(root, "designs.lock.yaml"));
  } catch (error) {
    if (applied) rmSync(target, { recursive: true, force: true });
    if (moved) renameSync(join(stageRoot, "previous"), target);
    throw error;
  } finally { rmSync(stageRoot, { recursive: true, force: true }); }
  return record;
}

export function rollbackPackage(root, id) {
  designId.parse(id);
  const record = readDesignLock(root).packages.find((p) => p.id === id);
  const previous = record?.history[0];
  if (!previous) throw new Error(`${id}: no previous version is available`);
  const pkg = inspectPackage(safePath(root, `designs/history/${id}/${previous.integrity}`), engineVersions(root));
  if (pkg.integrity !== previous.integrity) throw new Error(`${id}: rollback snapshot integrity mismatch`);
  return installPackage(root, { pkg, source: previous.source }, { update: true, integrity: previous.integrity });
}
