import { describe, it, expect, vi, afterEach } from "vitest";
import { parseRepo, formatStars, shieldsStarsUrl, fetchStarCount } from "./github";

describe("parseRepo", () => {
  it("parses a plain owner/repo URL", () => {
    expect(parseRepo("https://github.com/crs48/LIBCard")).toEqual({
      owner: "crs48",
      repo: "LIBCard",
    });
  });

  it("tolerates a trailing slash and a .git suffix", () => {
    expect(parseRepo("https://github.com/withastro/astro/")).toEqual({
      owner: "withastro",
      repo: "astro",
    });
    expect(parseRepo("https://github.com/withastro/astro.git")).toEqual({
      owner: "withastro",
      repo: "astro",
    });
  });

  it("rejects a bare profile URL", () => {
    expect(parseRepo("https://github.com/crs48")).toBeNull();
  });

  it("rejects a deep path inside a repo", () => {
    expect(parseRepo("https://github.com/crs48/LIBCard/issues")).toBeNull();
  });

  it("rejects reserved routes that aren't users", () => {
    expect(parseRepo("https://github.com/orgs/withastro")).toBeNull();
    expect(parseRepo("https://github.com/features/copilot")).toBeNull();
  });

  it("rejects non-github URLs", () => {
    expect(parseRepo("https://example.com/a/b")).toBeNull();
    expect(parseRepo("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("formatStars", () => {
  it("leaves counts under 1,000 as-is", () => {
    expect(formatStars(0)).toBe("0");
    expect(formatStars(42)).toBe("42");
    expect(formatStars(999)).toBe("999");
  });

  it("uses one decimal between 1k and 10k, trimming a trailing .0", () => {
    expect(formatStars(1000)).toBe("1k");
    expect(formatStars(1234)).toBe("1.2k");
    expect(formatStars(9950)).toBe("9.9k");
  });

  it("rounds to whole thousands at 10k+", () => {
    expect(formatStars(12_345)).toBe("12k");
    expect(formatStars(128_900)).toBe("129k");
  });
});

describe("shieldsStarsUrl", () => {
  it("builds a shields.io endpoint for the repo", () => {
    expect(shieldsStarsUrl({ owner: "crs48", repo: "LIBCard" })).toBe(
      "https://img.shields.io/github/stars/crs48/LIBCard?style=flat&label=%E2%98%85",
    );
  });
});

describe("fetchStarCount (fails soft)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the count on a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ stargazers_count: 4242 }), { status: 200 })),
    );
    // Unique repo per test to dodge the module-level cache.
    expect(await fetchStarCount({ owner: "ok", repo: "ok" })).toBe(4242);
  });

  it("returns null on a 404 (renamed/private repo) without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not Found", { status: 404 })),
    );
    expect(await fetchStarCount({ owner: "gone", repo: "gone" })).toBeNull();
  });

  it("returns null when fetch rejects (offline build)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND api.github.com");
      }),
    );
    expect(await fetchStarCount({ owner: "offline", repo: "offline" })).toBeNull();
  });
});
