import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  feedmeEndpoint,
  tipUrl,
  checkoutUrl,
  creatorTipUrl,
  formatShare,
  formatSignal,
  socialDisplayName,
  parseFeedmePublic,
  fetchFeedmePublic,
  clearFeedmeCache,
  loadFeedme,
  tipActionFor,
  tipBlockFor,
  feedmeHost,
  creatorTarget,
  FEEDME_MAX_BODY_BYTES,
  FEEDME_TIP_NOTE,
  type FeedmePublic,
} from "./feedme";
import { withBase } from "./site";

const ORIGIN = "https://creator-feedme.example";
const fixture = (): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL("./fixtures/feedme/public-response.json", import.meta.url), "utf-8"));
const okResponse = (body: unknown = fixture(), init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

/** A typed fetch mock so `mock.calls[0]` has the (url, init) tuple shape. */
type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const fetchMock = (impl: FetchImpl) => vi.fn<FetchImpl>(impl);

const parsed = (json: unknown, origin = ORIGIN): FeedmePublic => {
  const r = parseFeedmePublic(json, origin);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const errorOf = (json: unknown, origin = ORIGIN): string => {
  const r = parseFeedmePublic(json, origin);
  if (r.ok) throw new Error("expected a parse failure");
  return r.error;
};

describe("checkout URLs", () => {
  it("points at /api/public/libcard on the configured origin", () => {
    expect(feedmeEndpoint(ORIGIN)).toBe("https://creator-feedme.example/api/public/libcard");
  });

  it("selects one target and suggests Feedme's default amount in dollars", () => {
    expect(tipUrl(ORIGIN, "presence", 2200)).toBe("https://creator-feedme.example/checkout?amount=22.00&presence=1");
  });

  it("does not hardcode $22 — other configured defaults convert cents → dollars", () => {
    expect(tipUrl(ORIGIN, "presence", 1100)).toContain("amount=11.00");
    expect(tipUrl(ORIGIN, "presence", 505)).toContain("amount=5.05");
    expect(tipUrl(ORIGIN, "presence", 100_000)).toContain("amount=1000.00");
  });

  it("omits amount entirely when the endpoint didn't provide one (fetch failure)", () => {
    expect(tipUrl(ORIGIN, "presence")).toBe("https://creator-feedme.example/checkout?presence=1");
  });

  it("the general CTA is the bare checkout with no query string", () => {
    expect(checkoutUrl(ORIGIN)).toBe("https://creator-feedme.example/checkout");
    expect(new URL(checkoutUrl(ORIGIN)).search).toBe("");
  });

  it("the creator shortcut explicitly selects creator=1", () => {
    expect(creatorTipUrl(ORIGIN, 2200)).toBe("https://creator-feedme.example/checkout?amount=22.00&creator=1");
    expect(creatorTipUrl(ORIGIN)).toBe("https://creator-feedme.example/checkout?creator=1");
  });

  it("is absolute, so an Astro base path like /LIBCard is never prepended", () => {
    const href = tipUrl(ORIGIN, "presence", 2200);
    expect(href.startsWith(ORIGIN)).toBe(true);
    expect(withBase("/LIBCard", "/")).toBe("/LIBCard/"); // the base helper exists…
    expect(href).not.toContain("/LIBCard"); // …but checkout links never go through it
    expect(new URL(href).pathname).toBe("/checkout");
  });

  it("builds from a normalized origin regardless of a trailing slash", () => {
    expect(tipUrl(`${ORIGIN}/`, "x")).toBe(tipUrl(ORIGIN, "x"));
  });
});

describe("copy helpers", () => {
  it("formats thousandths as percentages with at most one decimal", () => {
    expect(formatShare(750)).toBe("75%");
    expect(formatShare(1)).toBe("0.1%");
    expect(formatShare(125)).toBe("12.5%");
    expect(formatShare(1000)).toBe("100%");
    expect(formatShare(0)).toBe("0%");
  });

  it("labels counts as public tips (payments), with correct plurals", () => {
    expect(formatSignal({ publicCount: 1, publicShareMillis: 750 })).toBe("75% of public picks · 1 public tip");
    expect(formatSignal({ publicCount: 3, publicShareMillis: 1 })).toBe("0.1% of public picks · 3 public tips");
  });

  it("distinguishes genuine zero signal from a missing number", () => {
    expect(formatSignal({ publicCount: 0, publicShareMillis: 0 })).toBe("No public picks yet");
  });

  it("names socials readably", () => {
    expect(socialDisplayName({ platform: "x" })).toBe("X");
    expect(socialDisplayName({ platform: "bluesky" })).toBe("Bluesky");
    expect(socialDisplayName({ platform: "x", label: "My writing on X" })).toBe("My writing on X");
  });
});

describe("parseFeedmePublic", () => {
  it("accepts the shipped contract and ignores unknown fields", () => {
    const data = parsed(fixture());
    expect(data.creatorName).toBe("Ada Example");
    expect(data.defaultAmountCents).toBe(2200);
    expect(data.targets).toHaveLength(5);
    expect(data.targets[0]).toEqual({
      id: "creator",
      label: "Just Ada",
      url: null,
      kind: "creator",
      publicCount: 1,
      publicShareMillis: 250,
    });
    expect("importedAt" in data).toBe(false);
    expect("futureField" in data.targets[4]).toBe(false);
  });

  it("accepts an all-zero signal (no public picks yet)", () => {
    const json = fixture();
    json.targets = (json.targets as any[]).map((t) => ({ ...t, publicCount: 0, publicShareMillis: 0 }));
    expect(parsed(json).targets.every((t) => t.publicShareMillis === 0)).toBe(true);
  });

  it("rejects a non-object body", () => {
    expect(errorOf(null)).toMatch(/not a JSON object/);
    expect(errorOf([])).toMatch(/not a JSON object/);
    expect(errorOf("hi")).toMatch(/not a JSON object/);
  });

  it("rejects shares that don't total 0 or 1000", () => {
    const json = fixture();
    (json.targets as any[])[1].publicShareMillis = 700;
    expect(errorOf(json)).toMatch(/total 951, expected 0 or 1000/);
  });

  it("rejects out-of-range or fractional shares", () => {
    const json = fixture();
    (json.targets as any[])[1].publicShareMillis = 1001;
    expect(errorOf(json)).toMatch(/publicShareMillis/);
    (json.targets as any[])[1].publicShareMillis = 74.9;
    expect(errorOf(json)).toMatch(/publicShareMillis/);
    (json.targets as any[])[1].publicShareMillis = -1;
    expect(errorOf(json)).toMatch(/publicShareMillis/);
  });

  it("rejects negative, fractional or non-numeric counts", () => {
    for (const bad of [-1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
      const json = fixture();
      (json.targets as any[])[1].publicCount = bad;
      expect(errorOf(json)).toMatch(/publicCount/);
    }
  });

  it("rejects duplicate target ids and invalid ids", () => {
    const dup = fixture();
    (dup.targets as any[])[2].id = "presence";
    expect(errorOf(dup)).toMatch(/duplicate target id "presence"/);
    const bad = fixture();
    (bad.targets as any[])[2].id = "Not-Valid";
    expect(errorOf(bad)).toMatch(/not a valid target id/);
  });

  it("rejects unrecognized kinds", () => {
    const json = fixture();
    (json.targets as any[])[1].kind = "project";
    expect(errorOf(json)).toMatch(/kind/);
  });

  it("rejects more than 100 targets", () => {
    const json = fixture();
    json.targets = Array.from({ length: 101 }, (_, i) => ({
      id: `t${i}`,
      label: `T ${i}`,
      url: null,
      kind: "link",
      publicCount: 0,
      publicShareMillis: 0,
    }));
    expect(errorOf(json)).toMatch(/too many targets/);
  });

  it("requires the response origin to match the configured origin", () => {
    const json = fixture();
    json.origin = "https://someone-else.example";
    expect(errorOf(json)).toMatch(/origin mismatch/);
    json.origin = "http://creator-feedme.example";
    expect(errorOf(json)).toMatch(/origin/);
    delete json.origin;
    expect(errorOf(json)).toMatch(/origin missing/);
  });

  it("tolerates a trailing slash on the response origin", () => {
    const json = fixture();
    json.origin = `${ORIGIN}/`;
    expect(parsed(json).origin).toBe(ORIGIN);
  });

  it("validates defaultAmountCents within Feedme's $1–$1,000 range", () => {
    for (const bad of [99, 100_001, 22.5, "2200", undefined]) {
      const json = fixture();
      json.defaultAmountCents = bad;
      expect(errorOf(json)).toMatch(/defaultAmountCents/);
    }
    const min = fixture();
    min.defaultAmountCents = 100;
    expect(parsed(min).defaultAmountCents).toBe(100);
  });

  it("bounds strings and requires creatorName / labels", () => {
    const noName = fixture();
    noName.creatorName = "";
    expect(errorOf(noName)).toMatch(/creatorName/);
    const longLabel = fixture();
    (longLabel.targets as any[])[1].label = "x".repeat(201);
    expect(errorOf(longLabel)).toMatch(/label/);
    const badUrl = fixture();
    (badUrl.targets as any[])[1].url = 42;
    expect(errorOf(badUrl)).toMatch(/url/);
  });
});

describe("fetchFeedmePublic (fails soft, one request per origin)", () => {
  const warn = vi.fn();
  beforeEach(() => {
    clearFeedmeCache();
    warn.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns validated data on a 200 response", async () => {
    const fetch = fetchMock(async () => okResponse());
    const data = await fetchFeedmePublic(ORIGIN, { fetch, warn });
    expect(data?.defaultAmountCents).toBe(2200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("https://creator-feedme.example/api/public/libcard");
    expect(warn).not.toHaveBeenCalled();
  });

  it("sends no cookies, credentials, auth headers or environment secrets", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_super_secret");
    const fetch = fetchMock(async () => okResponse());
    await fetchFeedmePublic(ORIGIN, { fetch, warn });
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("manual");
    const headers = Object.fromEntries(Object.entries(init.headers as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    expect(headers).not.toHaveProperty("authorization");
    expect(headers).not.toHaveProperty("cookie");
    expect(JSON.stringify(init)).not.toContain("ghp_super_secret");
  });

  it("coalesces concurrent callers into a single request", async () => {
    const fetch = vi.fn(async () => okResponse());
    const [a, b, c] = await Promise.all([
      fetchFeedmePublic(ORIGIN, { fetch, warn }),
      fetchFeedmePublic(`${ORIGIN}/`, { fetch, warn }),
      fetchFeedmePublic(ORIGIN, { fetch, warn }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("caches failures too — a down endpoint is asked once per build", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 503 }));
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/HTTP 503/);
  });

  it.each([404, 500])("treats HTTP %i as unavailable without throwing", async (status) => {
    const fetch = vi.fn(async () => new Response("", { status }));
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toContain(`HTTP ${status}`);
  });

  it("treats a network error as unavailable", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND creator-feedme.example");
    });
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toMatch(/ENOTFOUND/);
  });

  it("treats invalid JSON as unavailable", async () => {
    const fetch = vi.fn(async () => new Response("<html>oops</html>", { status: 200 }));
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toMatch(/not valid JSON/);
  });

  it("treats a malformed shape as unavailable (never as zero)", async () => {
    const json = fixture();
    (json.targets as any[])[1].publicShareMillis = 999;
    const fetch = vi.fn(async () => okResponse(json));
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toMatch(/unexpected response shape/);
  });

  it("times out instead of hanging the build", async () => {
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    const t0 = Date.now();
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn, timeoutMs: 30 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(warn.mock.calls[0]![0]).toMatch(/timed out after 30ms/);
  });

  it("rejects an oversized body declared via Content-Length", async () => {
    const fetch = vi.fn(async () => okResponse(fixture(), { headers: { "content-length": String(FEEDME_MAX_BODY_BYTES + 1) } }));
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toMatch(/bytes/);
  });

  it("rejects an oversized body while streaming, even without Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1024));
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(chunk); // endless; the reader must stop on its own
      },
    });
    const fetch = vi.fn(async () => new Response(stream, { status: 200 }));
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn, maxBytes: 8 * 1024 })).toBeNull();
    expect(pulls).toBeLessThan(40);
    expect(warn.mock.calls[0]![0]).toMatch(/exceeds 8192 bytes/);
  });

  it("follows a same-origin redirect", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "/api/public/libcard/" } }))
      .mockResolvedValueOnce(okResponse());
    const data = await fetchFeedmePublic(ORIGIN, { fetch, warn });
    expect(data?.creatorName).toBe("Ada Example");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![0]).toBe("https://creator-feedme.example/api/public/libcard/");
  });

  it("refuses a redirect to another origin", async () => {
    const fetch = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "https://evil.example/api/public/libcard" } }),
    );
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/another origin \(https:\/\/evil\.example\)/);
  });

  it("gives up on a redirect loop", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 301, headers: { location: "/api/public/libcard" } }));
    expect(await fetchFeedmePublic(ORIGIN, { fetch, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toMatch(/too many redirects/);
  });

  it("never fetches an origin the schema would reject", async () => {
    const fetch = vi.fn(async () => okResponse());
    expect(await fetchFeedmePublic("http://127.0.0.1:4401", { fetch, warn })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("loadFeedme + tipActionFor (joining config to the response)", () => {
  const warn = vi.fn();
  beforeEach(() => {
    clearFeedmeCache();
    warn.mockReset();
  });

  const presence = { feedme: { id: "presence", blurb: "More hours in the room with people.", aspiration: 3000 } };
  const openSource = { feedme: { id: "open-source", blurb: "" } };
  const retired = { feedme: { id: "retired" } };
  const plain = {};

  it("is null (no fetch) when the block is absent or disabled", async () => {
    const fetch = vi.fn();
    expect(await loadFeedme({}, { fetch, warn })).toBeNull();
    expect(await loadFeedme({ feedme: { enabled: false, origin: ORIGIN } }, { fetch, warn })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(tipActionFor(null, "link", presence, "Presence")).toBeNull();
  });

  it("renders live targets with the endpoint's default amount and real numbers", async () => {
    const fetch = vi.fn(async () => okResponse());
    const state = await loadFeedme({ feedme: { enabled: true, origin: `${ORIGIN}/` } }, { fetch, warn });
    expect(state?.origin).toBe(ORIGIN);

    const tip = tipActionFor(state, "link", presence, "75m of Presence aka Coaching");
    expect(tip).toMatchObject({
      href: "https://creator-feedme.example/checkout?amount=22.00&presence=1",
      ariaLabel: "Support more of 75m of Presence aka Coaching",
      blurb: "More hours in the room with people.",
      share: "74.9%",
      signal: "74.9% of public picks · 3 public tips",
    });

    const zero = tipActionFor(state, "link", openSource, "A project with source code");
    expect(zero?.signal).toBe("No public picks yet");
    expect(zero?.blurb).toBeUndefined();

    const social = tipActionFor(state, "social", { feedme: { id: "x" } }, "My writing on X");
    expect(social?.share).toBe("0.1%");
    expect(social?.signal).toBe("0.1% of public picks · 1 public tip");
  });

  it("never gives an action to an un-opted item or an API-only target", async () => {
    const state = await loadFeedme({ feedme: { enabled: true, origin: ORIGIN } }, { fetch: vi.fn(async () => okResponse()), warn });
    expect(tipActionFor(state, "link", plain, "Résumé")).toBeNull();
    // "api-only" exists in the response but no local item opted into it → no new link appears.
    expect(state?.data?.targets.some((t) => t.id === "api-only")).toBe(true);
    expect(tipActionFor(state, "link", plain, "anything")).toBeNull();
  });

  it("hides the action for an opted-in id the endpoint doesn't list (destination untouched)", async () => {
    const state = await loadFeedme({ feedme: { enabled: true, origin: ORIGIN } }, { fetch: vi.fn(async () => okResponse()), warn });
    expect(tipActionFor(state, "link", retired, "Retired thing")).toBeNull();
  });

  it("joins by id AND kind — a link id doesn't light up a social with the same id", async () => {
    const state = await loadFeedme({ feedme: { enabled: true, origin: ORIGIN } }, { fetch: vi.fn(async () => okResponse()), warn });
    expect(tipActionFor(state, "social", presence, "Presence")).toBeNull();
    expect(tipActionFor(state, "link", { feedme: { id: "x" } }, "X")).toBeNull();
  });

  it("keeps configured tip links (without amount) and makes no numeric claim when the endpoint is down", async () => {
    const state = await loadFeedme(
      { feedme: { enabled: true, origin: ORIGIN } },
      { fetch: vi.fn(async () => new Response("", { status: 503 })), warn },
    );
    expect(state).toEqual({ origin: ORIGIN, data: null });
    const tip = tipActionFor(state, "link", presence, "Presence");
    expect(tip?.href).toBe("https://creator-feedme.example/checkout?presence=1");
    expect(tip?.signal).toBeNull();
    expect(tip?.share).toBeNull();
    expect(tip?.target).toBeNull();
    // Even a locally-opted id Feedme would hide stays linked — Feedme re-validates at checkout.
    expect(tipActionFor(state, "link", retired, "Retired")?.href).toContain("retired=1");
    expect(creatorTarget(state)).toBeNull();
  });

  it("exposes the synthesized creator target for the CTA when available", async () => {
    const state = await loadFeedme({ feedme: { enabled: true, origin: ORIGIN } }, { fetch: vi.fn(async () => okResponse()), warn });
    expect(creatorTarget(state)).toMatchObject({ id: "creator", kind: "creator", publicShareMillis: 250 });
    expect(formatSignal(creatorTarget(state)!)).toBe("25% of public picks · 1 public tip");
  });
});

describe("tipActionFor with feedme: { skip: true }", () => {
  it("never renders an action for a skipped item, with or without endpoint data", () => {
    const data = parsed(fixture());
    expect(tipActionFor({ origin: ORIGIN, data }, "link", { feedme: { skip: true } }, "Privacy")).toBeNull();
    expect(tipActionFor({ origin: ORIGIN, data: null }, "link", { feedme: { skip: true } }, "Privacy")).toBeNull();
    // Belt and braces: an id-less object that isn't a skip (the schema rejects it) is also inert.
    expect(tipActionFor({ origin: ORIGIN, data: null }, "link", { feedme: {} }, "Odd")).toBeNull();
  });
});

describe("tipBlockFor (the tip-buttons block's primary Feedme button)", () => {
  const state = { origin: ORIGIN, data: null };

  it("reads the host off the origin for the default label", () => {
    expect(feedmeHost("https://crs.tips")).toBe("crs.tips");
    expect(feedmeHost("https://tips.example:8443")).toBe("tips.example:8443");
  });

  it("is null when the integration is off or the block didn't opt in", () => {
    expect(tipBlockFor(null, { feedme: true })).toBeNull();
    expect(tipBlockFor(state, { feedme: false })).toBeNull();
    expect(tipBlockFor(state, {})).toBeNull();
  });

  it("builds the unselected checkout with 'Tip at <host>' and the built-in note", () => {
    expect(tipBlockFor(state, { feedme: true })).toEqual({
      href: `${ORIGIN}/checkout`,
      label: "Tip at creator-feedme.example",
      host: "creator-feedme.example",
      note: FEEDME_TIP_NOTE,
    });
    expect(FEEDME_TIP_NOTE).toMatch(/more of/);
  });

  it("honors a custom label and note, and feedmeNote: false hides the note", () => {
    const custom = tipBlockFor(state, { feedme: true, feedmeLabel: " Tip me ", feedmeNote: " Why here. " });
    expect(custom).toMatchObject({ label: "Tip me", note: "Why here." });
    expect(tipBlockFor(state, { feedme: true, feedmeNote: false })?.note).toBeNull();
    // A blank custom note falls back to the built-in copy rather than an empty line.
    expect(tipBlockFor(state, { feedme: true, feedmeNote: "   " })?.note).toBe(FEEDME_TIP_NOTE);
  });

  it("does not depend on the public endpoint having answered", () => {
    const data = parsed(fixture());
    const withData = tipBlockFor({ origin: ORIGIN, data }, { feedme: true });
    expect(withData?.href).toBe(`${ORIGIN}/checkout`); // no amount, nothing pre-selected
    expect(withData).toEqual(tipBlockFor(state, { feedme: true }));
  });
});
