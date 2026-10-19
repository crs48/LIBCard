// A separate author repository and a clean owner site exercise the public CLI.
// Neither the working card nor the author's public assets enter this fixture.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { parse, stringify } from "yaml";
import { checkRendered } from "./design-check.mjs";
import { libcardSchema } from "../src/lib/schema.mjs";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(join(realpathSync(tmpdir()), "libcard-roundtrip-"));
const site = join(scratch, "site"); const published = join(scratch, "notebook");
mkdirSync(site);
let server;
let browser;
const run = (cmd, args, cwd = site) => {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, LIBCARD_CONFIG: "libcard.config.yaml", GITHUB_TOKEN: "" } });
  assert.equal(result.status, 0, `${cmd} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
const cli = (...args) => run("node", ["scripts/design.mjs", ...args]);
const git = (...args) => run("git", ["-c", "user.name=Example", "-c", "user.email=example@example.com", ...args], published);
const configPath = join(site, "libcard.config.yaml");
const allText = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? allText(join(dir, e.name)) : /\.(html|css|js)$/.test(e.name) ? [readFileSync(join(dir, e.name), "utf8")] : []).join("\n");
try {
  for (const dir of ["src", "scripts", "themes"]) cpSync(join(root, dir), join(site, dir), { recursive: true, filter: (p) => !p.includes("/.previews") });
  for (const file of ["package.json", "pnpm-lock.yaml", "tsconfig.json", "astro.config.mjs"]) cpSync(join(root, file), join(site, file));
  // Reuse dependencies, but keep Astro/Vite's content caches inside this fixture.
  mkdirSync(join(site, "node_modules"));
  for (const entry of readdirSync(join(root, "node_modules")).filter((name) => !name.startsWith(".") || [".bin", ".pnpm"].includes(name))) {
    symlinkSync(join(root, "node_modules", entry), join(site, "node_modules", entry));
  }
  mkdirSync(join(site, "public"));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#ddd"/><circle cx="48" cy="48" r="24" fill="#555"/></svg>';
  for (const file of ["avatar.svg", "favicon.svg"]) writeFileSync(join(site, "public", file), svg);
  const content = parse(readFileSync(join(root, "src/lib/fixtures/layouts/rich.config.yaml"), "utf8"));
  writeFileSync(configPath, stringify({ ...content, design: "author/notebook" }));
  cli("new", "author/notebook");
  const source = join(site, "designs/local/author/notebook");
  const manifest = parse(readFileSync(join(source, "design.yaml"), "utf8"));
  manifest.appearance = { file: "appearance.yaml" }; manifest.source = "https://example.com/notebook";
  manifest.files.push("appearance.yaml", "ornament.svg", "binary.png");
  const theme = parse(readFileSync(join(root, "themes/monochrome.yaml"), "utf8"));
  theme.author = "Separate artist"; theme.authorUrl = "https://example.com/artist"; theme.sourceUrl = "https://example.com/ink-source"; theme.license = "CC-BY-4.0";
  writeFileSync(join(source, "appearance.yaml"), stringify(theme));
  writeFileSync(join(source, "ornament.svg"), svg);
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=", "base64");
  writeFileSync(join(source, "binary.png"), bytes);
  const home = readFileSync(join(source, "Home.astro"), "utf8").replace("type Props", 'import ornament from "./ornament.svg?url";\ntype Props').replace("<aside>", '<aside><img src={ornament} width="32" height="32" alt="" />');
  writeFileSync(join(source, "Home.astro"), home);
  writeFileSync(join(source, "design.yaml"), stringify(manifest));
  cli("export", "author/notebook", published);
  assert(!existsSync(join(published, "libcard.config.yaml"))); assert(!existsSync(join(published, "public")));
  rmSync(source, { recursive: true });
  git("init", "-q"); git("add", "."); git("commit", "-qm", "release 1.0.0"); git("tag", "v1.0.0");
  cli("add", published, "--ref=v1.0.0");
  assert.deepEqual(readFileSync(join(site, "designs/installed/author/notebook/binary.png")), bytes);
  // A dormant package is valid metadata but throws if its code is ever imported.
  cli("new", "author/inactive");
  writeFileSync(join(site, "designs/local/author/inactive/Home.astro"), '---\nthrow new Error("INACTIVE_LAYOUT_EXECUTED");\n---\n<style>.inactive-sentinel { color:red; }</style>');
  run("pnpm", ["build"]);
  let html = readFileSync(join(site, "dist/index.html"), "utf8");
  checkRendered(html, libcardSchema.parse({ ...content, design: "author/notebook" }));
  assert(html.includes("Separate artist")); assert(html.includes("https://example.com/artist"));
  assert(html.includes('/fixture/designs#design-author%2Fnotebook'));
  assert(readFileSync(join(site, "dist/designs/index.html"), "utf8").includes("https://example.com/notebook"));
  assert(readFileSync(join(site, "dist/themes/index.html"), "utf8").includes("https://example.com/ink-source"));
  assert(html.includes("data-theme=\"design-")); assert(!allText(join(site, "dist")).includes("inactive-sentinel"));
  assert(!existsSync(join(site, "dist/designs/try")));
  const packagedTheme = JSON.parse(readFileSync(join(site, ".libcard/themes.json"), "utf8"))[0];
  assert.equal(packagedTheme.schemes.dark.tokens.bg, "#171717");
  assert(readFileSync(join(site, ".libcard/themes.css"), "utf8").includes("prefers-color-scheme: dark"));
  console.log("✓ Export → pinned Git install → build, bundled appearance/assets/credits, and inactive layout isolation");
  // Update, fork edited source, refuse overwrites, and recover offline.
  manifest.version = "1.1.0"; writeFileSync(join(published, "design.yaml"), stringify(manifest));
  git("add", "."); git("commit", "-qm", "release 1.1.0"); git("tag", "v1.1.0");
  cli("update", "author/notebook", "--ref=v1.1.0");
  const installed = join(site, "designs/installed/author/notebook/Home.astro");
  writeFileSync(installed, home + "\n<!-- owner edit -->\n");
  cli("fork", "author/notebook", "owner/my-notebook");
  assert(readFileSync(join(site, "designs/local/owner/my-notebook/Home.astro"), "utf8").includes("owner edit"));
  const rejected = spawnSync("node", ["scripts/design.mjs", "update", "author/notebook", "--ref=v1.1.0"], { cwd: site, encoding: "utf8" });
  assert.notEqual(rejected.status, 0); assert(rejected.stderr.includes("local edits"));
  writeFileSync(installed, home);
  rmSync(published, { recursive: true }); cli("rollback", "author/notebook");
  assert.equal(parse(readFileSync(join(site, "designs.lock.yaml"), "utf8")).packages[0].version, "1.0.0");
  writeFileSync(configPath, stringify({ ...content, design: "author/notebook", theme: { name: "author/notebook", switcher: true, random: ["author/notebook"] }, footer: { themeCredit: false, designCredit: false } }));
  run("pnpm", ["build"]);
  html = readFileSync(join(site, "dist/index.html"), "utf8");
  assert(html.includes("Separate artist")); assert(!html.includes('id="lc-presentation-credit" hidden')); assert(!html.includes('data-credit-kind="design"'));
  console.log("✓ Explicit update, edited-source fork, overwrite refusal, offline rollback and rebuild");
  // Opt-in previews render every installed layout, including namespaced packages.
  rmSync(join(site, "designs/local/author/inactive"), { recursive: true });
  cli("new", "author/studio", "--from=studio");
  writeFileSync(configPath, stringify({ ...content, design: "author/notebook", footer: { designGallery: true } }));
  run("pnpm", ["build"]);
  for (const [id, layout] of [["classic", "classic"], ["personal-home", "editorial"], ["studio", "studio"], ["author/studio", "author/studio"], ["author/notebook", "author/notebook"]]) {
    const preview = readFileSync(join(site, `dist/designs/try/${id}/index.html`), "utf8");
    assert(preview.includes(`data-layout="${layout}"`));
    assert(preview.includes('content="noindex, follow"'));
    assert(preview.includes('rel="canonical" href="https://example.com/fixture/"'));
    assert(preview.includes('/fixture/designs/try/author/notebook/'));
    assert(preview.includes('id="lc-design-next"'));
    checkRendered(preview, libcardSchema.parse({ ...content, design: id }));
    if (id === "author/studio") {
      assert(preview.includes('data-theme="studio"'));
      assert(preview.includes("independent work"));
      assert(preview.includes('class="lc-studio"'));
    }
  }
  assert(readFileSync(join(site, "dist/index.html"), "utf8").includes('data-layout="author/notebook"'));
  console.log("✓ Opt-in design previews, namespaced package routes, canonical URLs, and unchanged owner default");
  writeFileSync(configPath, stringify({ ...content, design: "author/notebook" }));
  // Watch the same config that clean builds use; test two live selections.
  server = spawn("pnpm", ["exec", "astro", "dev", "--host", "127.0.0.1", "--port", "0"], { cwd: site, env: { ...process.env, LIBCARD_CONFIG: "libcard.config.yaml" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const url = await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error("Dev server did not start")), 30000);
    let log = "";
    server.stdout.on("data", (data) => { log += data; const match = log.match(/http:\/\/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timer); done(`http://127.0.0.1:${match[1]}/fixture/`); } });
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Dev server exited ${code}: ${log}`)); });
  });
  const waitForLayout = async (layout) => {
    for (let i = 0; i < 80; i++) {
      try { const response = await fetch(url); const body = await response.text(); if (response.ok && body.includes(`data-layout="${layout}"`)) return body; } catch {}
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error(`Dev did not switch to ${layout}`);
  };
  await waitForLayout("author/notebook");
  writeFileSync(configPath, stringify({ ...content, design: "classic" })); await waitForLayout("classic");
  writeFileSync(configPath, stringify({ ...content, design: "personal-home" })); await waitForLayout("editorial");
  writeFileSync(configPath, stringify({ ...content, design: "studio" })); await waitForLayout("studio");
  console.log("✓ Dev config changes switch custom → Classic → Editorial → Studio without importing the inactive package");
  writeFileSync(configPath, stringify({ ...content, design: "author/studio", theme: { name: "studio", mode: "light", modeSwitcher: true } }));
  await waitForLayout("author/studio");
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  assert.equal(await page.locator("#lc-color-mode-control").count(), 1);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(await page.locator("html").getAttribute("data-color-mode"), "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  assert.equal(await page.locator("html").getAttribute("data-color-mode"), "light");
  console.log("✓ Shared Studio wrapper keeps one working light/dark control");
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
  rmSync(scratch, { recursive: true, force: true });
}
