import { describe, expect, it } from "vitest";
import { libcardSchema } from "./schema.mjs";

const base = { profile: { name: "Ada" }, site: { url: "https://example.com" } };
const metricool = { provider: "metricool", hash: "0123456789abcdef0123456789abcdef" };

describe("analytics configuration", () => {
  it("stays off by default and preserves legacy single-provider defaults", () => {
    expect(libcardSchema.parse(base).analytics).toBeUndefined();
    expect(libcardSchema.parse({ ...base, analytics: { provider: "goatcounter", code: "ada" } }).analytics)
      .toEqual({ provider: "goatcounter", code: "ada", mode: "pixel" });
  });

  it("accepts Metricool alone or alongside an existing provider", () => {
    expect(libcardSchema.parse({ ...base, analytics: metricool }).analytics).toEqual(metricool);
    expect(libcardSchema.parse({ ...base, analytics: [{ provider: "umami", websiteId: "example" }, metricool] }).analytics)
      .toEqual([{ provider: "umami", websiteId: "example", src: "https://cloud.umami.is/script.js", outboundClicks: true }, metricool]);
  });

  it.each(["", "abc", "g".repeat(32), "0123456789abcdef0123456789abcdef&extra=1"])("rejects an invalid Metricool hash: %s", (hash) => {
    expect(libcardSchema.safeParse({ ...base, analytics: { ...metricool, hash } }).success).toBe(false);
  });

  it("rejects duplicate providers to prevent duplicate pageview tracking", () => {
    expect(libcardSchema.safeParse({ ...base, analytics: [metricool, metricool] }).success).toBe(false);
    expect(libcardSchema.safeParse({ ...base, analytics: [] }).success).toBe(false);
  });
});
