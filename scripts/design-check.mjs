import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { parse as parseYaml, stringify } from "yaml";
import { parse as parseHtml } from "parse5";
import { libcardSchema } from "../src/lib/schema.mjs";
import { blockEntries } from "../src/lib/content.mjs";

const flatten = (node) => [node, ...(node.childNodes ?? []).flatMap(flatten)];
const attributes = (node) => Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));

/** Conformance checks rendered output, not source text or the author's claims. */
export function checkRendered(html, config) {
  const nodes = flatten(parseHtml(html));
  const elements = nodes.filter((n) => n.tagName);
  const attrs = elements.map(attributes);
  assert.equal(elements.filter((n) => n.tagName === "h1").length, 1, "render exactly one h1");
  assert.equal(elements.filter((n) => n.tagName === "main").length, 1, "render exactly one main");
  assert(attrs.some((a) => a.id === "main-content"), "main-content anchor is required");
  assert(attrs.some((a) => "data-libcard-utilities" in a), "render the utilities slot outside main");
  const main = elements.find((n) => n.tagName === "main");
  assert(!flatten(main).some((n) => "data-libcard-utilities" in attributes(n)), "utilities must stay outside main for landscape card mode");
  const hrefs = new Set(elements.filter((n) => n.tagName === "a").map((n) => attributes(n).href));
  for (const link of config.links) {
    assert(hrefs.has(link.url), `missing destination: ${link.url}`);
    if (link.github) assert(hrefs.has(link.github), `missing companion source: ${link.github}`);
  }
  for (const social of config.socials) assert(hrefs.has(social.url), `missing social: ${social.url}`);
  for (const image of elements.filter((n) => n.tagName === "img")) assert("alt" in attributes(image), "every image needs alt text (empty for decoration)");
  const base = config.site.base.replace(/\/$/, "");
  for (const attr of attrs) for (const path of [attr.href, attr.src].filter(Boolean)) {
    if (path.startsWith("/") && !path.startsWith("//")) assert(path === base || path.startsWith(`${base}/`), `URL ignores site.base: ${path}`);
  }
  const expected = config.sections?.filter((s) => s.type === "links").flatMap((s) => s.items) ?? config.links.map((l) => l.id).filter(Boolean);
  const actual = attrs.map((a) => a["data-link-id"]).filter(Boolean);
  assert.deepEqual(actual, expected, "render every link once, in owner section order, with data-link-id");
  for (const kind of new Set(blockEntries(config).map(({ block }) => block.type))) assert(attrs.some((a) => a["data-libcard-block"] === kind), `missing core fallback for ${kind}`);
  return { links: config.links.length, blocks: blockEntries(config).length };
}

export function checkDesign(root, id) {
  const rich = parseYaml(readFileSync(join(root, "src/lib/fixtures/layouts/rich.config.yaml"), "utf8"));
  const blocks = parseYaml(readFileSync(join(root, "src/lib/fixtures/layouts/blocks.config.yaml"), "utf8"));
  const fixtures = [
    { name: "rich", config: { ...rich, design: id, cardMode: { enabled: true } } },
    { name: "sparse", config: { profile: { name: "Alex Example with a long name that wraps comfortably" }, design: id, site: { url: "https://example.com", base: "/fixture" }, cardMode: { enabled: false } } },
    { name: "legacy", config: { profile: { name: "Alex Example" }, design: id, links: rich.links, blocks: rich.blocks, socials: rich.socials, profileActions: ["save-contact", "show-card"], site: { url: "https://example.com", base: "/fixture" } } },
    { name: "blocks", config: { ...blocks, design: id } },
  ];
  const output = join(root, ".libcard/checks", id);
  mkdirSync(output, { recursive: true });
  for (const fixture of fixtures) {
    const config = libcardSchema.parse(fixture.config);
    const path = join(output, `${fixture.name}.yaml`);
    writeFileSync(path, stringify(fixture.config));
    const outDir = join(output, fixture.name);
    const result = spawnSync("pnpm", ["exec", "astro", "build", "--outDir", outDir], { cwd: root, env: { ...process.env, LIBCARD_CONFIG: path }, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`${id} ${fixture.name} build failed:\n${result.stdout}\n${result.stderr}`);
    const html = readFileSync(join(outDir, "index.html"), "utf8");
    checkRendered(html, config);
    assert(existsSync(join(outDir, "card/index.html")), "card route missing");
    assert(existsSync(join(outDir, "contact.vcf")), "contact.vcf missing");
    console.log(`✓ ${id}: ${fixture.name} conformance passed`);
  }
  return output;
}

export async function previewDesign(root, output) {
  const { chromium } = await import("playwright");
  const dir = join(output, "rich");
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".vcf": "text/vcard" };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/fixture\/?/, "");
    let file = resolve(dir, path || "index.html");
    if (relative(dir, file).startsWith("..")) { res.writeHead(403).end(); return; }
    if (!file.split("/").at(-1).includes(".")) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": types[ext] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let browser;
  try {
    browser = await chromium.launch();
    for (const [name, width] of [["desktop", 1280], ["mobile", 390], ["small", 320], ["tablet", 768]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false, reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/fixture/`, { waitUntil: "networkidle" });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
      assert.equal(await page.locator("h1").count(), 1);
      const archive = page.locator("details").filter({ has: page.locator("summary", { hasText: "More experiments" }) });
      if (await archive.count()) { await archive.locator("summary").click(); assert(await archive.evaluate((node) => node.open)); }
      const failures = await page.locator("img").evaluateAll((images) => images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src));
      assert.deepEqual(failures, [], `${name}: broken images`);
      await page.keyboard.press("Tab");
      assert(await page.evaluate(() => document.activeElement !== document.body), "keyboard focus must reach a control");
      await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
      await context.close();
    }
    console.log(`✓ No-JS browser checks and previews: ${relative(root, output)}`);
  } finally { await browser?.close(); await new Promise((done) => server.close(done)); }
}
