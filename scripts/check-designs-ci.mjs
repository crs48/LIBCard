import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { discoverPackages } from "../src/lib/design-packages.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const ids = process.env.DESIGN_ID ? [process.env.DESIGN_ID] : ["classic", "personal-home", ...discoverPackages(root).map((p) => p.manifest.id)];
for (const id of ids) {
  const result = spawnSync("pnpm", ["run", "design:preview", "--", id], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
