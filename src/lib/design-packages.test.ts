import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { stringify } from "yaml";
import { inspectPackage, installPackage, fetchPackage, readDesignLock, rollbackPackage, discoverPackages, appearanceKey, copyPackage } from "./design-packages.mjs";
import { resolveDesign, builtinDesigns } from "./design-manifest.mjs";
import { isEnginePath } from "./engine-ownership.mjs";

const temporary: string[] = [];
const temp = () => { const dir = mkdtempSync(join(realpathSync(tmpdir()), "libcard-test-")); temporary.push(dir); return dir; };
const versions = { astro: "5.18.2", libcard: "0.2.0" };
function fixture(overrides: Record<string, unknown> = {}) {
  const dir = temp();
  const manifest = {
    schemaVersion: 1, id: "alex/notebook", name: "Notebook", version: "1.0.0", author: "Alex", license: "MIT",
    compatibility: { layoutApi: 1, astro: ">=5.13.0 <6", libcard: ">=0.2.0 <1" }, layout: { entry: "Home.astro" }, appearance: { use: "monochrome" },
    capabilities: { blockFallback: "core", clientJavaScript: false, remoteAssets: false }, files: ["Home.astro", "LICENSE", "README.md", "image.png"], ...overrides,
  };
  writeFileSync(join(dir, "design.yaml"), stringify(manifest));
  writeFileSync(join(dir, "Home.astro"), '---\nthrow new Error("INACTIVE CODE EXECUTED");\n---\n<slot name="utilities" />');
  writeFileSync(join(dir, "LICENSE"), "MIT"); writeFileSync(join(dir, "README.md"), "Example");
  writeFileSync(join(dir, "image.png"), Buffer.from([0, 255, 128, 13, 10, 42]));
  return dir;
}
function root() { const dir = temp(); writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.2.0" })); return dir; }
const fetched = (dir: string) => ({ pkg: inspectPackage(dir, versions), source: { kind: "directory", path: dir } });
afterEach(() => temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("design manifests and ownership", () => {
  it("inspects executable packages without running their code", () => expect(inspectPackage(fixture(), versions).manifest.id).toBe("alex/notebook"));
  it.each([
    { id: "classic" }, { id: "../escape" }, { compatibility: { layoutApi: 2, astro: "^5" } },
    { compatibility: { layoutApi: 1, astro: "^6" } }, { compatibility: { layoutApi: 1, astro: "^5", libcard: "^3" } },
    { layout: { use: "classic", entry: "Home.astro" } }, { layout: { entry: "../outside.astro" } },
    { defaults: { unknown: true } }, { scripts: { install: "touch hacked" } }, { dependencies: { react: "*" } },
  ])("rejects unsupported or unsafe manifest %j", (override) => expect(() => inspectPackage(fixture(override), versions)).toThrow());
  it("refuses unlisted files, dependency manifests, and owner content", () => {
    const dir = fixture(); writeFileSync(join(dir, "private.txt"), "private");
    expect(() => inspectPackage(dir, versions)).toThrow(/unlisted/);
    for (const file of ["package.json", "libcard.config.yaml"]) {
      const pkg = fixture({ files: ["Home.astro", "LICENSE", "README.md", "image.png", file] });
      writeFileSync(join(pkg, file), "{}"); expect(() => inspectPackage(pkg, versions)).toThrow(/not allowed/);
    }
  });
  it("rejects package and ancestor symlinks, including dangling ones", () => {
    const dir = fixture(); rmSync(join(dir, "Home.astro")); symlinkSync("/does-not-exist", join(dir, "Home.astro"));
    expect(() => inspectPackage(dir, versions)).toThrow(/Symlinks/);
    const link = join(temp(), "linked"); symlinkSync(fixture(), link);
    expect(() => inspectPackage(link, versions)).toThrow(/Symlinks/);
  });
  it("keeps appearance CSS identities deterministic and collision resistant", () => {
    expect(appearanceKey("alex/notebook")).toMatch(/^design-[a-f0-9]{20}$/);
    expect(appearanceKey("alex/notebook")).not.toBe(appearanceKey("alex-notebook/design"));
  });
  it("protects owner config, assets, local/installed/history packages and locks during engine updates", () => {
    for (const path of ["libcard.config.yaml", "public/avatar.png", "designs/local/alex/notebook/Home.astro", "designs/installed/alex/notebook/design.yaml", "designs/history/alex/notebook/a/Home.astro", "designs.lock.yaml", "../src/escape", "src/../public/avatar.png", "src\\escape"]) expect(isEnginePath(path)).toBe(false);
    expect(isEnginePath("src/layout-api/index.ts")).toBe(true);
    expect(isEnginePath("src/data/themes.json")).toBe(false);
  });
});

describe("portable selection and options", () => {
  const schema = { type: "object", additionalProperties: false, properties: { columns: { type: "integer", minimum: 1, maximum: 3 } }, required: ["columns"] };
  const custom = { id: "alex/notebook", layout: "alex/notebook", theme: "monochrome", defaults: { columns: 2 }, optionsSchema: schema };
  const catalog = [...builtinDesigns, custom];
  it("applies owner overrides over design defaults without touching content", () => {
    const config = { design: custom.id, layoutOptions: { [custom.id]: { columns: 3 } }, profile: { name: "Owner" } };
    expect(resolveDesign(config, catalog)).toMatchObject({ layout: custom.id, theme: "monochrome", options: { columns: 3 } });
    expect(config.profile.name).toBe("Owner");
    expect(resolveDesign({ design: custom.id, layout: "classic", theme: "frost" }, catalog)).toMatchObject({ layout: "classic", theme: "frost", options: {} });
  });
  it.each([{ columns: 4 }, { columns: "2" }, { columns: 2, typo: true }])("rejects invalid selected options %j", (options) => expect(() => resolveDesign({ design: custom.id, layoutOptions: { [custom.id]: options } }, catalog)).toThrow(/layoutOptions/));
  it("rejects missing designs and invalid dormant options", () => {
    expect(() => resolveDesign({ design: "nobody/missing" }, catalog)).toThrow(/Unknown design/);
    expect(() => resolveDesign({ layoutOptions: { [custom.id]: { columns: 9 } } }, catalog)).toThrow();
  });
});

describe("installation, update and recovery", () => {
  it("vendors binary assets, verifies offline, and exports only declared package files", () => {
    const source = fixture(); const site = root(); const record = installPackage(site, fetched(source));
    expect(readFileSync(join(site, "designs/installed/alex/notebook/image.png"))).toEqual(readFileSync(join(source, "image.png")));
    expect(discoverPackages(site, versions)).toHaveLength(1);
    expect(readDesignLock(site).packages[0].integrity).toBe(record.integrity);
    const exported = join(temp(), "export"); copyPackage(inspectPackage(source, versions), exported);
    expect(inspectPackage(exported, versions).integrity).toBe(record.integrity);
  });
  it("rejects hash mismatch and duplicate/local ID collisions without writing a lock", () => {
    const source = fixture(); const site = root();
    expect(() => installPackage(site, fetched(source), { integrity: "0".repeat(64) })).toThrow(/integrity/);
    expect(readDesignLock(site).packages).toEqual([]);
    installPackage(site, fetched(source)); expect(() => installPackage(site, fetched(source))).toThrow(/already installed/);
    const other = root(); copyPackage(inspectPackage(source, versions), join(other, "designs/local/alex/notebook"));
    expect(() => installPackage(other, fetched(source))).toThrow(/local design/);
  });
  it("detects edited vendored source during verification and refuses updates", () => {
    const source = fixture(); const site = root(); installPackage(site, fetched(source));
    writeFileSync(join(site, "designs/installed/alex/notebook/Home.astro"), "My edits");
    expect(() => discoverPackages(site, versions)).toThrow(/differ/);
    expect(() => installPackage(site, fetched(source), { update: true })).toThrow(/local edits/);
    expect(readFileSync(join(site, "designs/installed/alex/notebook/Home.astro"), "utf8")).toBe("My edits");
  });
  it("updates then rolls source and lock back together, without fetching", () => {
    const one = fixture(); const two = fixture({ version: "1.1.0" }); const site = root();
    const first = installPackage(site, fetched(one)); installPackage(site, fetched(two), { update: true });
    rmSync(one, { recursive: true }); rmSync(two, { recursive: true });
    const rolled = rollbackPackage(site, "alex/notebook");
    expect(rolled.version).toBe("1.0.0"); expect(rolled.integrity).toBe(first.integrity);
    expect(discoverPackages(site, versions)[0].manifest.version).toBe("1.0.0");
  });
  it("pins Git tags and rejects moved tags and symlink trees without checkout hooks", () => {
    const source = fixture(); const site = root();
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", ...args], { cwd: source, encoding: "utf8" });
    git("init", "-q"); git("add", "."); git("commit", "-qm", "fixture"); git("tag", "v1.0.0");
    let received = fetchPackage(source, "v1.0.0", versions);
    try { installPackage(site, received); expect(received.source.commit).toMatch(/^[a-f0-9]{40}$/); } finally { received.cleanup(); }
    writeFileSync(join(source, "README.md"), "changed"); git("add", "."); git("commit", "-qm", "changed"); git("tag", "-f", "v1.0.0");
    received = fetchPackage(source, "v1.0.0", versions);
    try { expect(() => installPackage(site, received, { update: true })).toThrow(/tag .* moved/); } finally { received.cleanup(); }
    symlinkSync("README.md", join(source, "linked")); git("add", "."); git("commit", "-qm", "symlink"); git("tag", "v2.0.0");
    expect(() => fetchPackage(source, "v2.0.0", versions)).toThrow(/Symlinks/);
    expect(() => fetchPackage(source, "main", versions)).toThrow(/version tag/);
  });
});
