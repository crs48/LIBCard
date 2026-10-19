import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { zodToJsonSchema } from "zod-to-json-schema";
import { designId, designManifestSchema, builtinDesigns } from "../src/lib/design-manifest.mjs";
import { discoverPackages, inspectPackage, engineVersions, packageCatalog, readDesignLock, fetchPackage, installPackage, rollbackPackage, safePath, copyPackage } from "../src/lib/design-packages.mjs";
import { scaffold } from "./design-scaffold.mjs";
import { prepareDesigns } from "./prepare-designs.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2).filter((a) => a !== "--");
const [command, ...rest] = args;
const positional = rest.filter((a) => !a.startsWith("--"));
const option = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const required = (value, message) => { if (!value) throw new Error(message); return value; };
const findPackage = (id) => {
  designId.parse(id);
  const dir = ["local", "installed"].map((kind) => safePath(root, `designs/${kind}/${id}`)).find(existsSync);
  if (!dir) throw new Error(`Unknown package ${id}`);
  return inspectPackage(dir, engineVersions(root));
};

try {
  if (command === "new") {
    const id = required(positional[0], "Usage: design:new author/name [--from=custom|classic|editorial|studio|preset]");
    console.log(`✓ Created ${scaffold(root, id, option("from"))}\nSelect design: ${id}, then run pnpm dev.`);
  } else if (command === "list") {
    const catalog = [...builtinDesigns, ...packageCatalog(discoverPackages(root))];
    catalog.forEach((d) => console.log(`${d.id}\t${d.version ?? "built-in"}\t${d.layout}\t${d.name}`));
  } else if (command === "schema") {
    const out = join(root, "designs/design.schema.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(zodToJsonSchema(designManifestSchema, { name: "LibcardDesign", $refStrategy: "none" }), null, 2) + "\n");
    console.log("✓ Wrote designs/design.schema.json");
  } else if (command === "add" || command === "update") {
    const target = required(positional[0], `Usage: design:${command} ${command === "add" ? "SOURCE" : "author/name"} [--ref=v1.0.0] [--integrity=SHA256]`);
    const previous = command === "update" ? readDesignLock(root).packages.find((p) => p.id === target) : undefined;
    if (command === "update" && !previous) throw new Error(`${target}: not installed`);
    const source = previous ? previous.source.kind === "git" ? previous.source.url : previous.source.path : target;
    const ref = option("ref") ?? (previous?.source.kind === "git" ? previous.source.commit : undefined);
    const fetched = fetchPackage(source, ref, engineVersions(root));
    try {
      if (previous && fetched.pkg.manifest.id !== target) throw new Error("An update cannot change the package ID");
      const result = installPackage(root, fetched, { update: command === "update", integrity: option("integrity") });
      console.log(`✓ ${result.id}@${result.version}\nIntegrity: ${result.integrity}\nSelect design: ${result.id}\nThis package ${fetched.pkg.manifest.layout.entry ? "contains Astro code that runs during builds" : "is a data-only preset"}. Capabilities: ${JSON.stringify(fetched.pkg.manifest.capabilities)}\nCommit designs/installed/, designs/history/ (if present), and designs.lock.yaml with your card.`);
    } finally { fetched.cleanup(); }
  } else if (command === "rollback") {
    const result = rollbackPackage(root, required(positional[0], "Usage: design:rollback author/name"));
    console.log(`✓ Restored ${result.id}@${result.version}, including its lock and source`);
  } else if (command === "fork") {
    const pkg = findPackage(required(positional[0], "Usage: design:fork author/name your-name/new-name"));
    const id = designId.parse(positional[1]);
    const destination = safePath(root, `designs/local/${id}`);
    if (existsSync(safePath(root, `designs/installed/${id}`))) throw new Error(`${id} already exists`);
    copyPackage(pkg, destination);
    writeFileSync(join(destination, "design.yaml"), stringify({ ...pkg.manifest, id }));
    console.log(`✓ Forked to ${destination}. Original credits and license retained. Select design: ${id}.`);
  } else if (command === "export") {
    const pkg = findPackage(required(positional[0], "Usage: design:export author/name NEW_DIRECTORY"));
    const destination = resolve(required(positional[1], "Provide a new export directory"));
    if (destination.startsWith(pkg.dir + "/")) throw new Error("Export outside the source package");
    copyPackage(pkg, destination);
    console.log(`✓ Exported ${pkg.files.length} declared files to ${destination}\nIntegrity: ${pkg.integrity}`);
  } else if (command === "check" || command === "preview") {
    const id = required(positional[0], `Usage: design:${command} DESIGN_ID [--metadata-only]`);
    const catalog = [...builtinDesigns, ...packageCatalog(discoverPackages(root))];
    if (!catalog.some((p) => p.id === id)) throw new Error(`Unknown design ${id}`);
    if (rest.includes("--metadata-only")) console.log(`✓ ${id}: manifest, options, files, compatibility and integrity valid; no package code executed`);
    else {
      const { checkDesign, previewDesign } = await import("./design-check.mjs");
      try {
        const output = checkDesign(root, id);
        if (command === "preview") await previewDesign(root, output);
      } finally { prepareDesigns(root); }
    }
  } else if (command === "catalog") {
    const pkg = findPackage(required(positional[0], "Usage: design:catalog author/name NEW_JSON_FILE"));
    const m = pkg.manifest;
    if (!m.source || !m.previews) throw new Error("Catalog submissions need source plus desktop/mobile previews in the manifest");
    const output = resolve(required(positional[1], "Provide an output JSON filename"));
    if (existsSync(output)) throw new Error("Output already exists");
    const record = readDesignLock(root).packages.find((p) => p.id === m.id);
    const entry = { id: m.id, name: m.name, description: m.description, author: m.author, license: m.license, version: m.version, source: m.source, ref: record?.source.kind === "git" ? record.source.commit : `v${m.version}`, integrity: pkg.integrity, compatibility: m.compatibility, capabilities: m.capabilities, previews: m.previews };
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(entry, null, 2) + "\n");
    console.log(`✓ Catalog entry: ${output}. Submit it to designs/catalog.json; adoption also works directly from your release URL.`);
  } else throw new Error("Commands: new, list, schema, add, update, rollback, fork, export, check, preview, catalog. See docs/DESIGNS.md.");
} catch (error) { console.error(`Design error: ${error.message}`); process.exitCode = 1; }
