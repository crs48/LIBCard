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
  const base = config.site.base.replace(/\/$/, "");
  if (config.headerAction) {
    const href = config.headerAction.url.startsWith("/") ? `${base}${config.headerAction.url}` : config.headerAction.url;
    assert(hrefs.has(href), `missing header action: ${href}`);
  }
  for (const kind of config.profileActions) {
    const href = kind === "email" ? config.contact.email ? `mailto:${config.contact.email}` : null : `${base}/${kind === "show-card" ? "card" : "contact.vcf"}`;
    if (href) assert(hrefs.has(href), `missing profile action: ${href}`);
  }
  const text = nodes.filter((n) => n.nodeName === "#text").map((n) => n.value).join(" ").replace(/\s+/g, " ");
  if (config.profile.role) assert(text.includes(config.profile.role.replace(/\s+/g, " ")), "missing profile role");
  for (const link of config.links) {
    const rendered = elements.find((node) => link.id && attributes(node)["data-link-id"] === link.id)
      ?? elements.find((node) => node.tagName === "a" && attributes(node).href === link.url)?.parentNode;
    if (rendered && attributes(rendered)["data-link-presentation"] === "compact") {
      const children = flatten(rendered);
      const label = children.filter((node) => node.nodeName === "#text").map((node) => node.value).join(" ").replace(/\s+/g, " ");
      assert(label.includes(link.label.replace(/\s+/g, " ")), `missing compact label: ${link.label}`);
      assert(!children.some((node) => node.tagName === "img"), `compact link must not render images: ${link.label}`);
    } else for (const field of ["description", "headline", "note", "actionLabel"]) {
      if (link[field]) assert(text.includes(link[field].replace(/\s+/g, " ")), `missing ${field} for ${link.label}`);
    }
  }
  for (const image of elements.filter((n) => n.tagName === "img")) assert("alt" in attributes(image), "every image needs alt text (empty for decoration)");
  for (const attr of attrs) for (const path of [attr.href, attr.src].filter(Boolean)) {
    if (path.startsWith("/") && !path.startsWith("//")) assert(path === base || path.startsWith(`${base}/`), `URL ignores site.base: ${path}`);
  }
  const expected = config.sections?.filter((s) => s.type === "links").flatMap((s) => s.items) ?? config.links.map((l) => l.id).filter(Boolean);
  const actual = attrs.map((a) => a["data-link-id"]).filter(Boolean);
  assert.deepEqual(actual, expected, "render every link once, in owner section order, with data-link-id");
  const expectedBlocks = config.sections ? config.sections.flatMap((s) => s.type === "blocks" ? config.blocks : s.type === "links" ? [] : [s]) : config.blocks;
  assert.deepEqual(attrs.map((a) => a["data-libcard-block"]).filter(Boolean), blockEntries({ blocks: expectedBlocks }).map(({ block }) => block.type), "render every block once in section order through the core fallback");
  let previousHeading = 0;
  for (const heading of elements.filter((n) => /^h[1-6]$/.test(n.tagName))) {
    const level = Number(heading.tagName[1]);
    assert(level <= previousHeading + 1, `heading order jumps from h${previousHeading} to h${level}`); previousHeading = level;
  }
  return { links: config.links.length, blocks: blockEntries(config).length };
}

export function checkDesign(root, id) {
  const rich = parseYaml(readFileSync(join(root, "src/lib/fixtures/layouts/rich.config.yaml"), "utf8"));
  const blocks = parseYaml(readFileSync(join(root, "src/lib/fixtures/layouts/blocks.config.yaml"), "utf8"));
  const fixtures = [
    { name: "rich", config: { ...rich, design: id, cardMode: { enabled: true, qr: "both" } } },
    { name: "sparse", config: { profile: { name: "Alex Example with a long name that wraps comfortably" }, design: id, site: { url: "https://example.com", base: "/fixture" }, cardMode: { enabled: false } } },
    { name: "legacy", config: { profile: { name: "Alex Example" }, design: id, links: rich.links, blocks: rich.blocks, socials: rich.socials, profileActions: ["save-contact", "show-card"], site: { url: "https://example.com", base: "/fixture" } } },
    { name: "blocks", config: { ...blocks, design: id } },
  ];
  const output = join(root, ".libcard/checks", id);
  mkdirSync(output, { recursive: true });
  const publicDir = join(output, "fixture-public");
  mkdirSync(publicDir, { recursive: true });
  const avatar = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#eee"/><circle cx="48" cy="36" r="16" fill="#666"/><path d="M16 89a32 32 0 0 1 64 0" fill="#666"/></svg>';
  for (const name of ["avatar.svg", "favicon.svg"]) writeFileSync(join(publicDir, name), avatar);
  for (const fixture of fixtures) {
    const config = libcardSchema.parse(fixture.config);
    const path = join(output, `${fixture.name}.yaml`);
    writeFileSync(path, stringify(fixture.config));
    const outDir = join(output, fixture.name);
    const result = spawnSync("pnpm", ["exec", "astro", "build", "--outDir", outDir], { cwd: root, env: { ...process.env, LIBCARD_CONFIG: path, LIBCARD_FIXTURE_PUBLIC: publicDir }, encoding: "utf8" });
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
    for (const [name, width] of [["desktop", 1280], ["mobile", 390], ["small", 320], ["tablet", 768], ["zoom", 640]]) {
      const context = await browser.newContext({ viewport: { width, height: name === "zoom" ? 450 : 900 }, deviceScaleFactor: name === "zoom" ? 2 : 1, javaScriptEnabled: false, reducedMotion: "reduce" });
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
      assert(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none"), "keyboard focus must be visible");
      await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
      const avatar = page.locator('img[src$="/avatar.svg"]').first();
      if (name === "small" && await avatar.count()) {
        await page.route("https://example.invalid/broken.png", (route) => route.abort());
        await page.route("**/avatar.svg", (route) => route.fulfill({ status: 302, headers: { location: "https://example.invalid/broken.png" } }));
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await avatar.evaluate((img) => img.naturalWidth), 0, "exercise a failed remote image request");
        assert(await avatar.getAttribute("alt"), "broken profile image retains descriptive alt text");
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "broken remote media must not cause overflow");
      }
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, javaScriptEnabled: false });
    const page = await context.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/fixture/`);
    assert(await page.locator(".lc-card-mode").isVisible(), "landscape card overlay remains available");
    assert(!await page.locator("main").isVisible(), "landscape overlay hides primary content");
    assert(await page.locator(".lc-card-mode").getByText("Save my contact", { exact: true }).isVisible(), "contact QR remains available");
    await page.screenshot({ path: join(output, "landscape.png") });
    const contact = await context.request.get(`${origin}/fixture/contact.vcf`);
    assert(contact.ok() && (await contact.text()).includes("BEGIN:VCARD"), "contact download works under a base path");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/fixture/card`);
    assert(await page.locator("main").isVisible(), "manual card page remains available");
    await context.close();
    console.log(`✓ No-JS browser checks and previews: ${relative(root, output)}`);
  } finally { await browser?.close(); await new Promise((done) => server.close(done)); }
}
