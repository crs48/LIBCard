import { describe, it, expect } from "vitest";
import { tweetIdFromUrl, tweetToken } from "./social-fetch";

describe("tweetIdFromUrl", () => {
  it("extracts the status id from twitter.com and x.com URLs", () => {
    expect(tweetIdFromUrl("https://twitter.com/jack/status/20")).toBe("20");
    expect(tweetIdFromUrl("https://x.com/me/status/1750000000000000000?s=1")).toBe("1750000000000000000");
  });

  it("returns null for non-status URLs", () => {
    expect(tweetIdFromUrl("https://x.com/me")).toBeNull();
  });
});

describe("tweetToken", () => {
  it("produces a deterministic token containing no zeros or dots", () => {
    const tok = tweetToken("1750000000000000000");
    expect(tok).toMatch(/^[a-z0-9]+$/);
    expect(tok).not.toMatch(/[0.]/);
  });
});
