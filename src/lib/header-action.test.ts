import { describe, expect, it } from "vitest";
import { libcardSchema } from "./schema.mjs";
import { resolveAction } from "./action";

const parse = (headerAction?: unknown) => libcardSchema.parse({
  profile: { name: "Ada", role: "Engineer & writer" },
  site: { url: "https://example.com", base: "/links" },
  headerAction,
});

describe("portable header action", () => {
  it("remains absent unless configured", () => {
    for (const value of [undefined, false]) expect(resolveAction(parse(value).headerAction, "/links")).toBeNull();
  });

  it("resolves a site path without introducing corner placement or a new tab", () => {
    const config = parse({ label: "  Work together  ", url: "/coaching?from=header#book", icon: "heart" });
    expect(config.profile.role).toBe("Engineer & writer");
    expect(config.headerAction).not.toHaveProperty("position");
    expect(resolveAction(config.headerAction, "/links/")).toEqual({
      label: "Work together", href: "/links/coaching?from=header#book", icon: "heart", newTab: false,
    });
  });

  it.each([
    ["mailto:ada@example.com", false], ["tel:+15551234567", false], ["sms:+15551234567", false],
    ["https://example.com/support", true], ["#contact", true],
  ])("preserves the destination and handler for %s", (url, newTab) => {
    expect(resolveAction(parse({ label: "Contact", url, newTab: true }).headerAction, "/links"))
      .toMatchObject({ href: url, newTab });
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "//example.com", "/\\example.com", "#has space"])("rejects unsafe destinations: %s", (url) => {
    expect(() => parse({ label: "Support", url })).toThrow();
  });
});
