import { describe, expect, it, vi } from "vitest";
vi.mock("../../.libcard/themes.json", () => ({ default: [{ slug: "design-test-key", designId: "artist/ink", name: "Ink", author: "Artist", authorUrl: "https://example.com/artist", sourceUrl: "https://example.com/ink", file: "appearance.yaml", license: "CC-BY-4.0" }] }));
import { resolveTheme, getThemeMeta, themeSourceUrl } from "./themes";

describe("independently authored appearances", () => {
  it("uses human package IDs in config and safe CSS keys in the page", () => {
    expect(resolveTheme("artist/ink").name).toBe("design-test-key");
    const selected = resolveTheme({ name: "artist/ink", switcher: true, allow: ["artist/ink", "monochrome"], random: ["artist/ink"] });
    expect(selected.cycle).toEqual(["design-test-key", "monochrome"]);
    expect(selected.randomPool).toEqual(["design-test-key"]);
  });
  it("retains independent appearance credits and source links", () => {
    const theme = getThemeMeta("artist/ink")!;
    expect(theme.author).toBe("Artist");
    expect(themeSourceUrl(theme)).toBe("https://example.com/ink");
    expect(themeSourceUrl(getThemeMeta("monochrome")!)).toContain("/themes/monochrome.yaml");
  });
});
