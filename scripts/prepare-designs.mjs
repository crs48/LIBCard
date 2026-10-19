import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { builtinDesigns, builtinLayouts, resolveDesign, designCatalogSchema } from "../src/lib/design-manifest.mjs";
import { discoverPackages, packageCatalog, appearanceKey } from "../src/lib/design-packages.mjs";
import { loadThemes, toRegistryEntry, themeToCss, themeArtifacts } from "../src/lib/theme-schema.mjs";
import { assertLayoutShell } from "../src/lib/layout-conformance.mjs";

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
  const artifacts = themeArtifacts(themes);
  writeChanged(join(root, "src/styles/themes.gen.css"), artifacts.css);
  writeChanged(join(root, "src/data/themes.json"), JSON.stringify(artifacts.registry, null, 2) + "\n");
  const appearances = packages.filter((p) => p.appearance).map((p) => ({
    ...p.appearance, slug: appearanceKey(p.manifest.id), file: p.manifest.appearance.file, official: false,
    sourceUrl: p.appearance.sourceUrl ?? p.manifest.source ?? p.appearance.authorUrl ?? "",
    designId: p.manifest.id,
  }));
  for (const pkg of catalog) if (!themes.some((t) => t.slug === pkg.theme) && !appearances.some((t) => t.slug === pkg.theme)) throw new Error(`${pkg.id}: unknown appearance ${pkg.theme}`);
  const entry = builtinLayouts[selected.layout]
    ? join(root, "src/layouts", builtinLayouts[selected.layout].component)
    : (() => { const pkg = packages.find((p) => p.manifest.id === selected.layout); return resolve(pkg.dir, pkg.manifest.layout.entry); })();
  const output = join(root, ".libcard");
  const indexPath = join(root, "designs/catalog.json");
  const community = existsSync(indexPath) ? designCatalogSchema.parse(JSON.parse(readFileSync(indexPath, "utf8"))).designs : [];
  writeChanged(join(output, "catalog.json"), JSON.stringify(community, null, 2) + "\n");
  // Gallery thumbnails are data assets, never an import of inactive layout code.
  const previews = packages.filter((p) => p.manifest.previews).map((p, i) => ({ id: p.manifest.id, i, path: relative(output, resolve(p.dir, p.manifest.previews.desktop)).split("\\").join("/") }));
  writeChanged(join(output, "previews.ts"), previews.map((p) => `import preview${p.i} from ${JSON.stringify(`${p.path}?url`)};`).join("\n") + `\nexport default {${previews.map((p) => `${JSON.stringify(p.id)}: preview${p.i}`).join(",")}} as Record<string, string>;\n`);
  // The home page imports only its selected layout; visitor previews opt in below.
  const importPath = relative(output, entry).split("\\").join("/");
  writeChanged(join(output, "Selected.astro"), `---\nimport Home from ${JSON.stringify(importPath.startsWith(".") ? importPath : `./${importPath}`)};\nimport type { LayoutProps } from "@libcard/layout";\ntype Props = LayoutProps;\nconst { page, options } = Astro.props;\n---\n<Home page={page} options={options}><slot name="utilities" slot="utilities" /></Home>\n`);
  // Opting into the design switcher builds separate pages for installed designs.
  // Otherwise keep inactive executable layouts out of the module graph.
  const previewLayouts = config.footer?.designGallery ? [...new Set(catalog.map((design) => design.layout))] : [selected.layout];
  const previewImports = previewLayouts.map((layout, i) => {
    const pkg = packages.find((p) => p.manifest.id === layout);
    const path = pkg ? resolve(pkg.dir, pkg.manifest.layout.entry) : join(root, "src/layouts", builtinLayouts[layout].component);
    return `import Home${i} from ${JSON.stringify(`./${relative(output, path).split("\\").join("/")}`)};`;
  });
  writeChanged(join(output, "Preview.astro"), `---\n${previewImports.join("\n")}\nimport type { LayoutProps } from "@libcard/layout";\ntype Props = LayoutProps & { layout: string };\nconst { layout, page, options } = Astro.props;\nconst layouts: Record<string, typeof Home0> = {${previewLayouts.map((layout, i) => `${JSON.stringify(layout)}: Home${i}`).join(",")}};\nconst Home = layouts[layout];\nif (!Home) throw new Error("Unknown preview layout: " + layout);\n---\n<Home page={page} options={options}><slot name="utilities" slot="utilities" /></Home>\n`);
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
      "astro:build:done": ({ dir }) => assertLayoutShell(readFileSync(new URL("index.html", dir), "utf8")),
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
