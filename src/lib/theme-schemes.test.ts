import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { themeSchema, resolveThemeScheme, themeVariants, themeToCss, toRegistryEntry } from "./theme-schema.mjs";
import { libcardSchema } from "./schema.mjs";

const theme = themeSchema.parse(parse(readFileSync(new URL("../../themes/monochrome.yaml", import.meta.url), "utf8")));
const withSlug = { ...theme, slug: "monochrome" };

describe("theme color schemes", () => {
  it("inherits typography and merges colors without mutating the base palette", () => {
    const dark = resolveThemeScheme(theme, "dark");
    expect(dark.mode).toBe("dark");
    expect(dark.tokens).toMatchObject({ bg: "#171717", font: "sans", displayFont: "serif", radius: "0.5rem" });
    expect(theme.tokens.bg).toBe("#ffffff");
    expect(theme.schemes?.dark?.tokens).not.toHaveProperty("font");
    expect(themeVariants(theme).map((v) => v.mode)).toEqual(["light", "dark"]);
    expect(toRegistryEntry(withSlug).schemes.dark.tokens.bg).toBe("#171717");
  });

  it("leaves existing single-palette themes unchanged in an unsupported mode", () => {
    const { schemes, ...legacy } = theme;
    expect(resolveThemeScheme(legacy, "dark")).toBe(legacy);
    expect(themeVariants(legacy)).toEqual([legacy]);
    expect(themeToCss({ ...legacy, slug: "legacy" })).not.toContain("prefers-color-scheme");
  });

  it("supports a dark base with a light scheme, including base-mode overrides", () => {
    const dual = themeSchema.parse({ ...theme, mode: "dark", schemes: {
      light: { tokens: { bg: "#fafafa" } }, dark: { tokens: { bg: "#181818" } },
    } });
    expect(themeVariants(dual).map((v) => [v.mode, v.tokens.bg])).toEqual([["dark", "#181818"], ["light", "#fafafa"]]);
  });

  it("generates separate forced and automatic rules, with native control colors", () => {
    const css = themeToCss(withSlug);
    expect(css).toContain('[data-theme="monochrome"][data-color-mode="dark"]');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':not([data-color-mode="light"]):not([data-color-mode="dark"])');
    expect(css).toContain('color-scheme: dark;');
  });

  it("resets expressive layers when a scheme replaces glass and mesh with solid colors", () => {
    const expressive = themeSchema.parse({ ...theme,
      background: { kind: "pastel-mesh", stops: ["#ffffff", "#eeeeee"] },
      buttons: { fill: "glass" },
      schemes: { dark: { tokens: {}, background: { kind: "solid" }, buttons: { fill: "solid" } } },
    });
    const css = themeToCss({ ...expressive, slug: "expressive" }).split('[data-theme="expressive"][data-color-mode="dark"] {')[1].split("}")[0];
    expect(css).toContain("--lc-mesh-1: transparent;");
    expect(css).toContain("--lc-glass-pct: 100%;");
    expect(css).not.toContain("--lc-glass-pct: 18%;");
  });

  it.each([
    { sepia: { tokens: {} } },
    { dark: { tokens: { bg: "red; color: black" } } },
    { dark: { tokens: { font: "url(example.com)" } } },
    { dark: { tokens: {}, css: "body {}" } },
  ])("rejects unrecognized modes and executable style values: %j", (schemes) => {
    expect(themeSchema.safeParse({ ...theme, schemes }).success).toBe(false);
  });

  it("validates explicit config modes and keeps the selector opt-in", () => {
    const config = { profile: { name: "Ada" }, site: { url: "https://example.com" } };
    expect(libcardSchema.parse({ ...config, theme: { name: "monochrome" } }).theme).toMatchObject({ mode: "system", modeSwitcher: false });
    expect(libcardSchema.safeParse({ ...config, theme: { name: "monochrome", mode: "sepia" } }).success).toBe(false);
  });
});
