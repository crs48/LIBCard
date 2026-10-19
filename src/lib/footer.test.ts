import { describe, expect, it } from "vitest";
import { builtinDesigns } from "./design-manifest.mjs";
import { footerCredits, galleryId, isHomePage, type DesignEntry } from "./footer";
import { getThemeMeta, type ThemeMeta } from "./themes";

const config = { design: "personal-home", layout: "editorial", footer: { designCredit: true, themeCredit: true } };
const context = { base: "/cards/", home: true };
const monochrome = getThemeMeta("monochrome")!;
const frost = getThemeMeta("frost")!;
const notebook: DesignEntry = {
  id: "author/notebook", name: "Notebook", layout: "author/notebook", theme: "design-notebook",
  credit: { author: "Author", authorUrl: "https://example.org", license: "MIT" },
};
const designs = [...builtinDesigns, notebook] as DesignEntry[];
const packaged: ThemeMeta = { ...monochrome, slug: "design-notebook", designId: notebook.id };

describe("contextual footer credits", () => {
  it("links a complete design to its gallery entry", () => {
    expect(footerCredits(config, monochrome, context)).toEqual([
      { name: "Personal home", kind: "design", href: "/cards/designs#design-personal-home" },
    ]);
  });

  it("describes a mixed layout and theme, then returns to the complete design", () => {
    expect(footerCredits(config, frost, context)).toMatchObject([
      { name: "Editorial", kind: "layout", href: "/cards/designs#design-personal-home" },
      { name: frost.name, kind: "theme", href: "/cards/themes#theme-frost", author: frost.author },
    ]);
    expect(footerCredits(config, monochrome, context).map((c) => c.kind)).toEqual(["design"]);
    expect(footerCredits({ ...config, layout: "classic" }, monochrome, context)).toMatchObject([
      { name: "Classic", kind: "layout", href: "/cards/designs#design-classic" },
      { name: "Monochrome", kind: "theme" },
    ]);
  });

  it("keeps theme-only cards and utility pages focused on their actual theme", () => {
    for (const credits of [
      footerCredits({ ...config, design: undefined, layout: "classic" }, frost, context),
      footerCredits(config, frost, { ...context, home: false }),
    ]) expect(credits.map((c) => c.kind)).toEqual(["theme"]);
    expect(footerCredits({ ...config, design: undefined }, frost, context).map((c) => c.kind)).toEqual(["layout", "theme"]);
  });
  it("credits Studio as a complete design or as a layout with another theme", () => {
    const studio = { ...config, design: "studio", layout: "studio" };
    expect(footerCredits(studio, getThemeMeta("studio")!, context)).toEqual([
      { name: "Studio", kind: "design", href: "/cards/designs#design-studio" },
    ]);
    expect(footerCredits(studio, frost, context)).toMatchObject([
      { name: "Studio", kind: "layout", href: "/cards/designs#design-studio" },
      { name: frost.name, kind: "theme", href: "/cards/themes#theme-frost" },
    ]);
  });

  it("credits installed designs once and links namespaced IDs to real anchors", () => {
    const credits = footerCredits({ ...config, design: notebook.id, layout: notebook.layout }, packaged, { ...context, designs });
    expect(credits).toMatchObject([{ name: "Notebook", kind: "design", author: "Author" }]);
    expect(credits).toHaveLength(1);
    expect(decodeURIComponent(new URL(credits[0].href, "https://example.org").hash.slice(1))).toBe(galleryId("design", notebook.id));
    expect(footerCredits({ ...config, design: undefined, layout: notebook.layout }, frost, { ...context, designs })[0]).toMatchObject({ name: "Notebook", kind: "layout" });
  });

  it("recognizes package appearance aliases as the same complete design", () => {
    expect(footerCredits({ ...config, design: notebook.id, layout: notebook.layout }, packaged, {
      ...context, designs: [{ ...notebook, theme: notebook.id }],
    }).map((c) => c.kind)).toEqual(["design"]);
  });

  it("honors optional credit controls independently", () => {
    expect(footerCredits({ ...config, footer: { designCredit: false, themeCredit: true } }, monochrome, context).map((c) => c.kind)).toEqual(["theme"]);
    expect(footerCredits({ ...config, footer: { designCredit: true, themeCredit: false } }, frost, context).map((c) => c.kind)).toEqual(["layout"]);
    expect(footerCredits({ ...config, footer: { designCredit: false, themeCredit: false } }, monochrome, context)).toEqual([]);
  });

  it("retains required theme attribution alongside a complete design", () => {
    expect(footerCredits(config, { ...monochrome, license: "CC-BY-4.0" }, context).map((c) => c.kind)).toEqual(["design", "theme"]);
    expect(footerCredits({ ...config, footer: { designCredit: false, themeCredit: false } }, { ...monochrome, license: "CC-BY-4.0" }, context).map((c) => c.kind)).toEqual(["theme"]);
  });

  it("retains required package credits when appearance or layout is overridden", () => {
    const required = { ...notebook, credit: { ...notebook.credit!, license: "CC-BY-4.0" } };
    const hidden = { ...config, design: notebook.id, layout: notebook.layout, footer: { designCredit: false, themeCredit: false } };
    const ctx = { ...context, designs: [...designs.filter((d) => d.id !== notebook.id), required] };
    expect(footerCredits(hidden, packaged, ctx).map((c) => c.kind)).toEqual(["design"]);
    expect(footerCredits(hidden, frost, ctx).map((c) => c.kind)).toEqual(["layout"]);
    expect(footerCredits({ ...hidden, layout: "classic" }, frost, ctx).map((c) => c.kind)).toEqual(["design"]);
  });

  it("recognizes the home route at root and on GitHub Pages", () => {
    expect(isHomePage("/", "/")).toBe(true);
    expect(isHomePage("/cards", "/cards/")).toBe(true);
    expect(isHomePage("/cards/", "/cards")).toBe(true);
    expect(isHomePage("/cards/themes/", "/cards/")).toBe(false);
    expect(isHomePage("/designs", "/")).toBe(false);
  });
});
