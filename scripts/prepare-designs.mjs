import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { builtinDesigns, resolveDesign } from "../src/lib/design-manifest.mjs";
import { discoverPackages, packageCatalog, appearanceKey } from "../src/lib/design-packages.mjs";
import { loadThemes, toRegistryEntry, themeToCss } from "../src/lib/theme-schema.mjs";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const writeChanged = (path, value) => {
  if (existsSync(path) && readFileSync(path, "utf8") === value) return;
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value);
};

export function prepareDesigns(root = projectRoot) {
  const configPath = resolve(root, process.env.LIBCARD_CONFIG || "libcard.config.yaml");
  const config = parse(readFileSync(configPath, "utf8"));
  const packages = discoverPackages(root);
  const catalog = [...builtinDesigns, ...packageCatalog(packages)];
  const selected = resolveDesign(config, catalog);
  const themes = loadThemes(join(root, "themes")).filter((t) => !t.isExample);
  const appearances = packages.filter((p) => p.appearance).map((p) => ({
    ...p.appearance, slug: appearanceKey(p.manifest.id), file: p.manifest.appearance.file, official: false,
    sourceUrl: p.manifest.source ?? p.appearance.authorUrl ?? "",
    designId: p.manifest.id,
  }));
  for (const pkg of catalog) if (!themes.some((t) => t.slug === pkg.theme) && !appearances.some((t) => t.slug === pkg.theme)) throw new Error(`${pkg.id}: unknown appearance ${pkg.theme}`);
  const entry = selected.layout === "classic" || selected.layout === "editorial"
    ? join(root, `src/layouts/${selected.layout === "classic" ? "Classic" : "Editorial"}.astro`)
    : (() => { const pkg = packages.find((p) => p.manifest.id === selected.layout); return resolve(pkg.dir, pkg.manifest.layout.entry); })();
  const output = join(root, ".libcard");
  // One literal import. Inactive Astro/JS/CSS never enters Vite's module graph.
  const importPath = relative(output, entry).split("\\").join("/");
  writeChanged(join(output, "Selected.astro"), `---\nimport Home from ${JSON.stringify(importPath.startsWith(".") ? importPath : `./${importPath}`)};\nimport type { LayoutProps } from "@libcard/layout";\ntype Props = LayoutProps;\nconst { page, options } = Astro.props;\n---\n<Home page={page} options={options}><slot name="utilities" slot="utilities" /></Home>\n`);
  writeChanged(join(output, "designs.json"), JSON.stringify(catalog, null, 2) + "\n");
  writeChanged(join(output, "themes.json"), JSON.stringify(appearances.map((theme) => ({ ...toRegistryEntry(theme), sourceUrl: theme.sourceUrl, designId: theme.designId, preview: "" })), null, 2) + "\n");
  writeChanged(join(output, "themes.css"), appearances.map(themeToCss).join("\n\n"));
  return { configPath, entry, selected, packages };
}

/** The same preparation runs before dev, check, and build; selection restarts dev. */
export function designIntegration(root = projectRoot) {
  return {
    name: "libcard-designs",
    hooks: {
      "astro:server:setup": ({ server }) => {
        const watched = [resolve(root, process.env.LIBCARD_CONFIG || "libcard.config.yaml"), join(root, "designs"), join(root, "designs.lock.yaml"), join(root, "themes")];
        server.watcher.add(watched);
        let timer;
        const onChange = (path) => {
          if (!watched.some((p) => path === p || path.startsWith(`${p}/`))) return;
          clearTimeout(timer);
          timer = setTimeout(() => server.restart(), 150);
        };
        server.watcher.on("all", (_event, path) => onChange(path));
        server.httpServer?.once("close", () => clearTimeout(timer));
      },
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareDesigns();
