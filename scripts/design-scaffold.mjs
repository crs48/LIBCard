import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stringify, parse } from "yaml";
import { designId } from "../src/lib/design-manifest.mjs";
import { safePath } from "../src/lib/design-packages.mjs";

export function scaffold(root, id, from = "custom") {
  designId.parse(id);
  if (!["custom", "classic", "editorial", "preset"].includes(from)) throw new Error("--from must be custom, classic, editorial, or preset");
  const destination = safePath(root, `designs/local/${id}`);
  if (existsSync(destination) || existsSync(safePath(root, `designs/installed/${id}`))) throw new Error(`${id} already exists`);
  const name = id.split("/")[1].replace(/-/g, " ");
  const manifest = {
    schemaVersion: 1, id, name, version: "1.0.0", description: "A personal layout for portable LibCard content.", author: id.split("/")[0], license: "MIT",
    compatibility: { layoutApi: 1, astro: ">=5.13.0 <6", libcard: ">=0.2.0 <1" },
    layout: from === "preset" ? { use: "editorial" } : { entry: "./Home.astro", ...(from === "custom" ? { optionsSchema: "./options.schema.json" } : {}) },
    appearance: { use: "monochrome" },
    defaults: from === "custom" ? { width: "wide" } : {},
    capabilities: { blockFallback: "core", clientJavaScript: false, remoteAssets: false },
    files: ["LICENSE", "README.md", "sample.config.yaml", ...(from === "preset" ? [] : ["Home.astro"]), ...(from === "custom" ? ["options.schema.json"] : [])],
  };
  const template = from === "custom" ? `---
import { Profile, ProfileActions, HeaderAction, Section, SocialRow, CardReveal, type LayoutProps } from "@libcard/layout";
type Props = LayoutProps;
const { page, options } = Astro.props;
---
<div class="notebook" data-width={options.width}>
  <main id="main-content">
    <aside><HeaderAction action={page.headerAction} /><Profile profile={page.profile} /><ProfileActions actions={page.actions} /><SocialRow socials={page.socials} /></aside>
    <div class="entries">{page.sections.map((section, index) => <Section section={section} index={index} />)}<CardReveal url={page.card.url} /></div>
  </main>
  <slot name="utilities" />
</div>
<style>
  .notebook { max-width:68rem; margin:auto; padding:clamp(1rem,4vw,3rem); }
  .notebook[data-width="narrow"] { max-width:52rem; }
  main { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr); gap:clamp(2rem,5vw,5rem); align-items:start; }
  aside, .entries { display:flex; min-width:0; flex-direction:column; gap:2rem; }
  aside { position:sticky; top:2rem; }
  @media(max-width:44rem) { main { grid-template-columns:minmax(0,1fr); } aside { position:static; } }
</style>
` : `---
import { ${from === "classic" ? "Classic" : "Editorial"} as Base, type LayoutProps } from "@libcard/layout";
type Props = LayoutProps;
const { page, options } = Astro.props;
---
<Base page={page} options={options}><slot name="utilities" slot="utilities" /></Base>
`;
  const sample = parse(readFileSync(join(root, "src/lib/fixtures/layouts/rich.config.yaml"), "utf8"));
  sample.design = id;
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, "design.yaml"), stringify(manifest));
  writeFileSync(join(destination, "sample.config.yaml"), stringify(sample));
  writeFileSync(join(destination, "LICENSE"), `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${manifest.author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`);
  writeFileSync(join(destination, "README.md"), `# ${name}\n\n${manifest.description}\n\nSelect \`design: ${id}\` in your LibCard config. Requires Layout API 1, Astro 5.13+, and LibCard 0.2+.\n\nThis design renders all portable sections through the core block fallback. It adds no client JavaScript or remote assets. Content may still enable its own embeds, integrations, and scripts.\n\nRun \`pnpm run design:check -- ${id}\` and \`pnpm run design:preview -- ${id}\` from LibCard. Add the generated desktop/mobile PNGs to this package, list them in \`files\` and \`previews\`, and set the manifest's \`source\` to your release repository before publishing.\n\nExport with \`pnpm run design:export -- ${id} ./output/${name.replaceAll(" ", "-")}\`. Publish that directory as its own Git repository, tag v1.0.0, and share the repository URL. No engine files or private owner content are exported.\n\nSee LibCard's docs/DESIGNS.md for the public API, options, assets, and release workflow.\n`);
  if (from !== "preset") writeFileSync(join(destination, "Home.astro"), template);
  if (from === "custom") writeFileSync(join(destination, "options.schema.json"), JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, properties: { width: { type: "string", enum: ["wide", "narrow"] } } }, null, 2) + "\n");
  return destination;
}
