import { describe, expect, it } from "vitest";
import { libcardSchema } from "./schema.mjs";

const parseBlock = (block: unknown) => libcardSchema.safeParse({
  profile: { name: "Ada" },
  site: { url: "https://ada.github.io", base: "/links" },
  blocks: [block],
});

describe("copy-prompt configuration", () => {
  it("opts into the built-in setup prompt without requiring duplicated text", () => {
    const result = parseBlock({ type: "copy-prompt" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blocks).toEqual([{ type: "copy-prompt", label: "Copy setup prompt" }]);
    }
  });

  it("preserves multiline custom prompts, including text that resembles markup", () => {
    const text = 'First line\n</textarea><script>alert("example")</script>\nLast line';
    const result = parseBlock({ type: "copy-prompt", text, label: "Copy my prompt" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.blocks[0]).toMatchObject({ text, label: "Copy my prompt" });
  });

  it.each([
    ["blank text", { text: " " }],
    ["oversized text", { text: "x".repeat(12001) }],
    ["blank label", { label: " " }],
    ["oversized label", { label: "x".repeat(81) }],
    ["unknown fields", { html: "<button>Copy</button>" }],
  ] as const)("rejects %s", (_name, fields) => {
    expect(parseBlock({ type: "copy-prompt", ...fields }).success).toBe(false);
  });
});
