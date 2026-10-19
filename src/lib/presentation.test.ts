import { describe, it, expect } from "vitest";
import { libcardSchema } from "./schema.mjs";
import { resolvePresentation } from "./presentation";
import { normalizePage } from "./page";
import { blockEntries } from "./content.mjs";

const minimal = { profile: { name: "Ada" }, site: { url: "https://example.org", base: "/card" } };
const parse = (input: object = {}) => libcardSchema.parse({ ...minimal, ...input });
const resolved = (input: object = {}) => { const config = parse(input); return { ...config, ...resolvePresentation(config) }; };
const links = [
  { id: "first", label: "One", url: "https://example.org/one" },
  { id: "second", label: "Two", url: "https://example.org/two", feedme: { skip: true } },
];
const section = { type: "links", id: "work", title: "Selected work", items: ["second", "first"] };

describe("presentation selection", () => {
  it("preserves Classic and the default theme without new settings", () => {
    expect(resolved()).toMatchObject({ layout: "classic", theme: "default" });
  });
  it("resolves the complete Personal home preset without an eager theme default", () => {
    expect(parse({ design: "personal-home" }).theme).toBeUndefined();
    expect(resolved({ design: "personal-home" })).toMatchObject({ layout: "editorial", theme: "monochrome", options: { density: "compact", mediaTone: "grayscale" } });
  });
  it("preserves explicit layout, theme switcher, and option overrides", () => {
    const theme = { name: "frost", random: true, allow: ["frost", "dawn"], switcher: true };
    const config = resolved({ design: "personal-home", layout: "classic", theme, layoutOptions: { editorial: { density: "comfortable" } } });
    expect(config.layout).toBe("classic");
    expect(config.theme).toMatchObject(theme);
    expect(resolved({ design: "personal-home", layoutOptions: { editorial: { mediaTone: "original" } } }).options.mediaTone).toBe("original");
  });
  it("rejects misspelled designs, layouts, and layout options", () => {
    for (const input of [{ design: "notebook" }, { layout: "rows" }, { layoutOptions: { editorial: { typo: true } } }]) expect(() => parse(input)).toThrow();
  });
});

describe("portable content", () => {
  it("preserves legacy link and block order", () => {
    const config = resolved({ links, blocks: [{ type: "text", markdown: "Hello" }] });
    const page = normalizePage(config);
    expect(page.legacy).toBe(true);
    expect(page.sections[0]).toMatchObject({ links: config.links });
    expect(page.sections[1]).toEqual(config.blocks[0]);
  });
  it("renders the same normalized content in both layouts, including archives", () => {
    const content = { links, sections: [{ ...section, collapsed: true }, { type: "text", markdown: "A note" }] };
    const classic = normalizePage(resolved({ ...content, design: "classic" }));
    const editorial = normalizePage(resolved({ ...content, design: "personal-home" }));
    expect(editorial).toEqual(classic);
    expect(editorial.sections[0]).toMatchObject({ collapsed: true, links: [expect.objectContaining({ id: "second", feedme: { skip: true } }), expect.objectContaining({ id: "first" })] });
  });
  it("keeps canonical blocks available to importers with an explicit placement", () => {
    const config = resolved({ links, blocks: [{ type: "text", markdown: "About me" }], sections: [section, { type: "blocks" }] });
    expect(normalizePage(config).sections[1]).toEqual(config.blocks[0]);
    expect(blockEntries(config)).toHaveLength(1);
  });
  it.each([
    { links, sections: [{ ...section, items: ["first"] }] },
    { links, sections: [{ ...section, items: ["first", "first", "second"] }] },
    { links, sections: [{ ...section, items: ["first", "second", "missing"] }] },
    { links: [...links, links[0]], sections: [section] },
    { links: [{ label: "No ID", url: "https://example.org" }], sections: [] },
    { links, sections: [section], blocks: [{ type: "text", markdown: "Lost" }] },
    { sections: [{ type: "blocks" }, { type: "blocks" }] },
  ])("rejects ambiguous or lost content: %j", (input) => expect(() => parse(input)).toThrow());
  it("validates Feedme blocks inside sections and retains diagnostic paths", () => {
    const result = libcardSchema.safeParse({ ...minimal, sections: [{ type: "tip-buttons", feedme: true }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["sections", 0, "feedme"]);
  });
  it("traverses section embeds and canonical blocks exactly once", () => {
    const config = parse({ blocks: [{ type: "text", markdown: "About" }], sections: [{ type: "blocks" }, { type: "video", provider: "youtube", id: "dQw4w9WgXcQ" }] });
    expect(blockEntries(config).map(({ block }) => block.type)).toEqual(["text", "video"]);
  });
  it("requires useful image metadata and rejects unsafe media sources", () => {
    const image = { src: "/projects/one.webp", alt: "App screenshot", width: 1200, height: 800 };
    expect(parse({ links: [{ ...links[0], image }] }).links[0].image).toEqual(image);
    for (const src of ["javascript:alert(1)", "//tracker.example/icon", "/../secret", "/\\example.com/x"]) expect(() => parse({ links: [{ ...links[0], image: { ...image, src } }] })).toThrow();
    expect(() => parse({ links: [{ ...links[0], image: { ...image, alt: "" } }] })).toThrow();
  });
});
