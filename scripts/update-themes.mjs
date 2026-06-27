// Pull the latest community themes from upstream — `pnpm run update-themes`.
//
// Because LibCard is adopted by *forking* the template, new themes merged into
// the upstream gallery don't reach your fork automatically. This fetches the
// current themes/*.yaml from upstream's main branch and drops them into your
// local themes/ folder. It NEVER touches libcard.config.yaml — your theme choice
// and settings are left exactly as they are.
//
// Usage:
//   pnpm run update-themes                 # from the default upstream (main)
//   pnpm run update-themes owner/repo      # from a specific upstream
//   pnpm run update-themes --ref=branch    # track a branch other than main
//   pnpm run update-themes --dry-run       # show what would change, write nothing
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const upstream = args.find((a) => !a.startsWith("-")) || process.env.LIBCARD_UPSTREAM || "crs48/LIBCard";
const ref = (args.find((a) => a.startsWith("--ref=")) ?? "").split("=")[1] || "main";

const themesDir = fileURLToPath(new URL("../themes", import.meta.url));
const headers = { "User-Agent": "libcard-update-themes", Accept: "application/vnd.github+json" };

async function main() {
  const listUrl = `https://api.github.com/repos/${upstream}/contents/themes?ref=${ref}`;
  const res = await fetch(listUrl, { headers });
  if (res.status === 404) {
    console.error(`No themes/ folder found in ${upstream}@${ref}. Is the upstream correct?`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Failed to list ${upstream} themes/ (HTTP ${res.status}). ${res.status === 403 ? "GitHub API rate limit — try again later." : ""}`);
    process.exit(1);
  }
  const entries = await res.json();
  const wanted = entries.filter(
    (e) => e.type === "file" && (e.name.endsWith(".yaml") || e.name === "theme.schema.json"),
  );

  mkdirSync(themesDir, { recursive: true });
  let added = 0;
  let updated = 0;
  for (const e of wanted) {
    const local = `${themesDir}/${e.name}`;
    const remote = await (await fetch(e.download_url, { headers })).text();
    const current = existsSync(local) ? readFileSync(local, "utf-8") : null;
    if (current === remote) continue;
    const isNew = current === null;
    console.log(`  ${isNew ? "+ add " : "~ update"} themes/${e.name}`);
    if (!dryRun) writeFileSync(local, remote);
    isNew ? added++ : updated++;
  }

  if (added + updated === 0) {
    console.log(`✓ Already up to date with ${upstream}.`);
    return;
  }
  console.log(`\n${dryRun ? "Would apply" : "Applied"} ${added} new, ${updated} updated theme(s) from ${upstream}.`);
  if (!dryRun) console.log("Next: pnpm run gen:themes   (regenerate CSS + registry), then pnpm dev to preview.");
}

main().catch((err) => {
  console.error(`update-themes failed: ${err?.message ?? err}`);
  process.exit(1);
});
