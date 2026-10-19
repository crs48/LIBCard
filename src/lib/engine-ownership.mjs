const regenerated = new Set(["libcard.schema.json", "src/data/themes.json", "src/styles/themes.gen.css", "themes/theme.schema.json"]);
const engineFiles = new Set(["astro.config.mjs", "package.json", "pnpm-lock.yaml", "tsconfig.json"]);
const engineDirectories = ["src/", "scripts/", ".github/workflows/"];

/** Explicitly protected even if a future upstream release contains these paths. */
export function isEnginePath(path) {
  if (path.includes("\\") || path.split("/").some((p) => p === ".." || p === "." || !p)) return false;
  if (path === "libcard.config.yaml" || path === "designs.lock.yaml" || path.startsWith("public/") || path.startsWith("designs/") || path.startsWith(".libcard/")) return false;
  return !regenerated.has(path) && (engineFiles.has(path) || engineDirectories.some((p) => path.startsWith(p)) || /^themes\/[^/]+\.yaml$/.test(path));
}
