// Pull the latest LibCard *engine* from upstream — `pnpm run update`.
//
// LibCard is adopted by "Use this template" or by forking, so engine
// improvements (new components, fixes, built-in themes) don't reach your copy
// automatically. This syncs the engine files from a tagged upstream release into
// your repo and NEVER touches your content: libcard.config.yaml, anything in
// public/ (avatar, CNAME, og.png…), or themes you authored yourself. After it
// runs, `pnpm install && pnpm build` reinstalls deps and regenerates every
// derived file, and fails loudly if the new engine dislikes your config.
//
// It's the wider-scoped sibling of update-themes.mjs: same idioms and the same
// config-safety promise, but it replaces the whole engine and pins to a release
// instead of tracking a branch.
//
// Usage:
//   pnpm run update                  # latest upstream release (falls back to main)
//   pnpm run update --ref=v0.2.0     # a specific tag or branch
//   pnpm run update owner/repo       # a different upstream
//   pnpm run update --dry-run        # show what would change, write nothing
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { isEnginePath } from "../src/lib/engine-ownership.mjs";
import { discoverPackages, safePath } from "../src/lib/design-packages.mjs";
import semver from "semver";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const upstream = args.find((a) => !a.startsWith("-")) || process.env.LIBCARD_UPSTREAM || "crs48/LIBCard";
const refArg = (args.find((a) => a.startsWith("--ref=")) ?? "").split("=")[1] || "";

const root = fileURLToPath(new URL("../", import.meta.url));
const ua = "libcard-update";
const apiHeaders = { "User-Agent": ua, Accept: "application/vnd.github+json" };

/** Resolve which ref to sync from: an explicit --ref, else the latest published
 *  release, else main (a brand-new project may not have cut a release yet). */
async function resolveRef() {
  if (refArg) return refArg;
  const res = await fetch(`https://api.github.com/repos/${upstream}/releases/latest`, { headers: apiHeaders });
  if (res.ok) return (await res.json()).tag_name;
  if (res.status === 404) {
    console.log(`No published release on ${upstream} yet — tracking main.`);
    return "main";
  }
  if (res.status === 403) {
    console.error("GitHub API rate limit reached — try again later.");
    process.exit(1);
  }
  console.error(`Failed to resolve the latest release (HTTP ${res.status}).`);
  process.exit(1);
}

async function main() {
  const ref = await resolveRef();

  // One API call lists the whole tree; the file contents come from raw.github…,
  // which doesn't count against the REST rate limit (handy on a 60-req/hr token).
  const treeUrl = `https://api.github.com/repos/${upstream}/git/trees/${ref}?recursive=1`;
  const res = await fetch(treeUrl, { headers: apiHeaders });
  if (res.status === 404) {
    console.error(`Couldn't read ${upstream}@${ref}. Is the upstream/ref correct?`);
    process.exit(1);
  }
  if (!res.ok) {
    const hint = res.status === 403 ? " GitHub API rate limit — try again later." : "";
    console.error(`Failed to list ${upstream}@${ref} (HTTP ${res.status}).${hint}`);
    process.exit(1);
  }
  const { tree, truncated, sha: revision } = await res.json();
  if (truncated) throw new Error("Upstream tree was truncated; no files were changed.");

  const wanted = tree.filter((e) => e.type === "blob" && isEnginePath(e.path));

  const packages = discoverPackages(root);
  const fetchFile = async (path) => {
    const response = await fetch(`https://raw.githubusercontent.com/${upstream}/${revision}/${path}`, { headers: { "User-Agent": ua } });
    if (!response.ok) throw new Error(`Cannot read ${path} (HTTP ${response.status}); no files were changed.`);
    return Buffer.from(await response.arrayBuffer());
  };
  if (packages.length) {
    const remotePackage = JSON.parse((await fetchFile("package.json")).toString("utf8"));
    const remoteApi = JSON.parse((await fetchFile("src/layout-api/version.json")).toString("utf8"));
    for (const { manifest } of packages) {
      if (remoteApi.layoutApi !== manifest.compatibility.layoutApi ||
          !semver.satisfies(remotePackage.version, manifest.compatibility.libcard) ||
          !semver.intersects(remotePackage.dependencies.astro, manifest.compatibility.astro)) {
        throw new Error(`${manifest.id} is incompatible with the target engine. Update or remove that design before updating the engine; no files were changed.`);
      }
    }
  }
  // Download and validate every destination before making the update reviewable.
  const files = [];
  for (const entry of wanted) {
    if (entry.mode === "120000") throw new Error(`Upstream symlink is unsupported: ${entry.path}`);
    const localPath = safePath(root, entry.path);
    files.push({ ...entry, localPath, remote: await fetchFile(entry.path) });
  }
  let added = 0;
  let updated = 0;
  for (const e of files) {
    const { localPath, remote } = e;
    const current = existsSync(localPath) ? readFileSync(localPath) : null;
    if (current?.equals(remote)) continue;
    const isNew = current === null;
    console.log(`  ${isNew ? "+ add " : "~ update"} ${e.path}`);
    if (!dryRun) {
      mkdirSync(dirname(localPath), { recursive: true });
      writeFileSync(localPath, remote);
    }
    isNew ? added++ : updated++;
  }

  console.log("");
  if (added + updated === 0) {
    console.log(`✓ Engine already up to date with ${upstream}@${ref}.`);
    return;
  }
  console.log(`${dryRun ? "Would apply" : "Applied"} ${added} new, ${updated} updated engine file(s) from ${upstream}@${ref}.`);
  console.log("Your config, public/, custom themes, designs/, and designs.lock.yaml were left untouched.");
  if (!dryRun) {
    console.log("\nNext:");
    console.log("  pnpm install && pnpm build   # reinstall deps + regenerate derived files (fails loudly if the");
    console.log("                               # new engine dislikes your config — nothing is deployed until it passes)");
    console.log('  git add -A && git commit -m "chore: update LibCard engine" && git push');
  }
}

main().catch((err) => {
  console.error(`update failed: ${err?.message ?? err}`);
  process.exit(1);
});
