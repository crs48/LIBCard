import { describe, expect, it } from "vitest";
import { libcardSchema } from "./schema.mjs";

const parse = (cornerButton?: unknown) => libcardSchema.safeParse({
  profile: { name: "Ada" },
  site: { url: "https://ada.github.io", base: "/links" },
  cornerButton,
});
const button = { label: "Support my work", url: "https://tips.example.com" };

describe("corner button configuration", () => {
  it("leaves existing and explicitly disabled cards opted out", () => {
    for (const value of [undefined, false]) {
      const result = parse(value);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.cornerButton).toBe(value);
    }
  });

  it("defaults to the bottom right and current tab without a support-specific icon", () => {
    const result = parse({ ...button, label: "  Book a call  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cornerButton).toEqual({
      ...button, label: "Book a call", position: "bottom-right", newTab: false,
    });
  });

  it.each(["top-left", "top-right", "bottom-left", "bottom-right"])("accepts %s", (position) => {
    expect(parse({ ...button, position, icon: "calendar", newTab: true }).success).toBe(true);
  });

  it.each([
    "https://example.com/tips?project=1#give", "http://localhost:3000/",
    "mailto:ada@example.com?subject=Hello", "tel:+15551234567", "sms:+15551234567",
    "/card", "/", "/contact?from=button#form", "#contact",
  ])("accepts a navigable destination: %s", (url) => {
    expect(parse({ ...button, url }).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)", "data:text/html,test", "file:///etc/passwd",
    "//example.com", "/\\example.com", "/foo\\bar", "https://example.com/\npath",
    "tips.example.com", "", "#has space",
  ])("rejects unsafe or ambiguous destinations: %s", (url) => {
    expect(parse({ ...button, url }).success).toBe(false);
  });

  it.each([
    { label: " " }, { label: "x".repeat(49) }, { icon: " " },
    { position: "center" }, { html: "<b>Support</b>" }, { newTab: "true" },
    { label: undefined }, { url: undefined },
  ])("rejects invalid fields: %j", (fields) => {
    expect(parse({ ...button, ...fields }).success).toBe(false);
  });
});
