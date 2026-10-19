import { describe, expect, it } from "vitest";
import { libcardSchema } from "./schema.mjs";
import { resolvePresentation } from "./presentation";
import { designChoices, designPreviewHref, previewConfig } from "./design-preview";
import { randomAlternative } from "./random-choice";

const parsed = libcardSchema.parse({
  profile: { name: "Ada", tagline: "The original bio" },
  site: { url: "https://example.org", base: "/cards" },
  design: "personal-home",
  theme: { name: "monochrome", modeSwitcher: true },
  layoutOptions: { editorial: { mediaTone: "original" } },
  footer: { designGallery: true },
});
const config = { ...parsed, ...resolvePresentation(parsed) };

describe("visitor design previews", () => {
  it("renders another design without changing owner content or defaults", () => {
    const classic = previewConfig(config, "classic");
    expect(classic).toMatchObject({ design: "classic", layout: "classic", theme: { name: "default", modeSwitcher: true, random: false } });
    expect(classic.profile).toEqual(config.profile);
    expect(classic.links).toEqual(config.links);
    expect(config).toMatchObject({ design: "personal-home", layout: "editorial", theme: { name: "monochrome" } });
    expect(previewConfig(config, "personal-home").options).toMatchObject({ mediaTone: "original" });
  });

  it("only exposes preview routes when the owner opts in", () => {
    expect(designChoices(config, "/cards/")).toMatchObject([
      { id: "classic", href: "/cards/designs/try/classic/" },
      { id: "personal-home", href: "/cards/designs/try/personal-home/" },
      { id: "studio", href: "/cards/designs/try/studio/" },
    ]);
    expect(designChoices({ ...config, footer: { ...config.footer, designGallery: false } }, "/")).toEqual([]);
    expect(designPreviewHref("/cards", "author/notebook")).toBe("/cards/designs/try/author/notebook/");
  });

  it("selects across the remaining choices without repeating the current one", () => {
    expect(randomAlternative(["classic", "personal-home", "notebook"], "personal-home", () => 0)).toBe("classic");
    expect(randomAlternative(["classic", "personal-home", "notebook"], "personal-home", () => 0.999)).toBe("notebook");
    expect(randomAlternative(["monochrome", "frost", "dawn"], "monochrome", () => 0.75)).toBe("dawn");
  });

  it("handles unknown, single, and empty current choices", () => {
    expect(randomAlternative(["classic"], "classic")).toBe("classic");
    expect(randomAlternative(["classic", "personal-home"], "missing", () => 0.75)).toBe("personal-home");
    expect(randomAlternative([], undefined)).toBeUndefined();
  });
});
