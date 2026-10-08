import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import {
  libcardSchema,
  normalizeFeedmeOrigin,
  FEEDME_MAX_OPT_INS,
  FEEDME_RESERVED_IDS,
} from "./schema.mjs";

const load = (rel: string) => parse(readFileSync(new URL(rel, import.meta.url), "utf-8"));
const fixture = () => load("./fixtures/feedme/enabled.config.yaml");
const minimal = () => ({
  profile: { name: "Ada" },
  links: [] as any[],
  socials: [] as any[],
  site: { url: "https://example.github.io" },
});

/** Flatten Zod issues to "path: message" lines for readable assertions. */
function issues(data: unknown): string[] {
  const r = libcardSchema.safeParse(data);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("libcardSchema — existing configs", () => {
  it("still validates the repository's own libcard.config.yaml", () => {
    const cfg = load("../../libcard.config.yaml");
    const r = libcardSchema.safeParse(cfg);
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues, null, 2)).toBe(true);
    if (!r.success) return;
    // The maintainer's card points at their own Feedme (crs.tips) with the
    // header CTA off. No per-link opt-ins: Feedme lists every link by default,
    // and leaving them out keeps the ♥ pills and captions off the card.
    expect(r.data.feedme).toEqual({ enabled: true, origin: "https://crs.tips", give: false });
    expect(r.data.links.every((l) => l.feedme === undefined)).toBe(true);
    // The Support section leads with the Feedme button and its own explainer.
    const tips = r.data.blocks.find((b) => b.type === "tip-buttons");
    expect(tips).toMatchObject({ feedme: true, venmo: "christophersmothers" });
    expect(tips && tips.type === "tip-buttons" && tips.feedmeNote).toMatch(/crs\.tips/);
  });

  it("treats an absent feedme block as disabled (no defaults injected)", () => {
    const r = libcardSchema.safeParse(minimal());
    expect(r.success).toBe(true);
    expect(r.success && r.data.feedme).toBeUndefined();
  });

  it("accepts an explicitly disabled block without an origin", () => {
    const r = libcardSchema.safeParse({ ...minimal(), feedme: { enabled: false } });
    expect(r.success).toBe(true);
    expect(r.success && r.data.feedme).toEqual({ enabled: false, give: true });
  });
});

describe("libcardSchema — Feedme opt-ins", () => {
  it("accepts the enabled fixture with link and social opt-ins", () => {
    const r = libcardSchema.safeParse(fixture());
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues, null, 2)).toBe(true);
    if (!r.success) return;
    expect(r.data.feedme).toEqual({ enabled: true, origin: "https://creator-feedme.example/", give: true });
    expect(r.data.links[0]!.feedme).toEqual({
      id: "presence",
      blurb: "More hours in the room with people.",
      aspiration: 3000,
    });
    expect(r.data.links[1]!.feedme).toEqual({ id: "open-source", blurb: "More time maintaining this project." });
    expect(r.data.links[2]!.feedme).toBeUndefined(); // ordinary link
    expect(r.data.socials[0]!.feedme).toEqual({ id: "x", blurb: "More of this voice." });
    expect(r.data.socials[1]!.feedme).toBeUndefined();
    // Everything that was there before is still there.
    expect(r.data.links[0]).toMatchObject({ label: "75m of Presence aka Coaching", icon: "heart", status: "ready" });
    expect(r.data.links[1]).toMatchObject({ github: "https://github.com/example/project", stars: "off" });
  });

  it("trims the blurb and allows omitting it", () => {
    const cfg = minimal();
    cfg.links = [{ label: "A", url: "https://a.example", feedme: { id: "a", blurb: "  hi  " } }];
    const r = libcardSchema.safeParse(cfg);
    expect(r.success && r.data.links[0]!.feedme?.blurb).toBe("hi");
  });

  it("rejects malformed ids without rewriting them", () => {
    for (const id of ["Presence", "-leading", "has space", "", "ü", "a".repeat(65), "x_y"]) {
      const cfg = minimal();
      cfg.links = [{ label: "A", url: "https://a.example", feedme: { id } }];
      const out = issues(cfg);
      expect(out.some((m) => m.startsWith("links.0.feedme.id:") && /lowercase slug/.test(m)), `${id} → ${out}`).toBe(true);
    }
  });

  it("rejects the reserved ids", () => {
    for (const id of FEEDME_RESERVED_IDS) {
      const cfg = minimal();
      cfg.socials = [{ platform: "x", url: "https://x.com/a", feedme: { id } }];
      expect(issues(cfg)).toContainEqual(expect.stringMatching(/^socials\.0\.feedme\.id: .*reserved/));
    }
  });

  it("rejects duplicate ids across links AND socials, pointing at both paths", () => {
    const cfg = minimal();
    cfg.links = [
      { label: "A", url: "https://a.example", feedme: { id: "same" } },
      { label: "B", url: "https://b.example", feedme: { id: "other" } },
    ];
    cfg.socials = [{ platform: "x", url: "https://x.com/a", feedme: { id: "same" } }];
    const out = issues(cfg);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^socials\.0\.feedme\.id: Duplicate feedme\.id "same" — already used at links\.0\.feedme\.id/);
  });

  it("rejects more than 99 opt-ins but doesn't count ordinary items", () => {
    const cfg = minimal();
    cfg.links = Array.from({ length: FEEDME_MAX_OPT_INS }, (_, i) => ({
      label: `L${i}`,
      url: "https://a.example",
      feedme: { id: `l${i}` },
    }));
    // 300 ordinary links on top are fine.
    cfg.links.push(...Array.from({ length: 300 }, (_, i) => ({ label: `P${i}`, url: "https://p.example" })));
    expect(issues(cfg)).toEqual([]);
    cfg.socials = [{ platform: "x", url: "https://x.com/a", feedme: { id: "one-too-many" } }];
    expect(issues(cfg)).toContainEqual(expect.stringMatching(/^links: At most 99 links and socials can opt into Feedme \(found 100\)/));
  });

  it("rejects invalid aspirations and blurbs", () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ aspiration: -1 }, /aspiration: .*greater than or equal to 0/],
      [{ aspiration: 12.5 }, /aspiration: .*whole number/],
      [{ aspiration: "3000" }, /aspiration: Expected number/],
      [{ aspiration: 1_000_001 }, /aspiration: .*less than or equal to 1000000/],
      [{ blurb: "x".repeat(241) }, /blurb: .*at most 240/],
      [{ blurb: 42 }, /blurb: Expected string/],
    ];
    for (const [extra, re] of cases) {
      const cfg = minimal();
      cfg.links = [{ label: "A", url: "https://a.example", feedme: { id: "a", ...extra } }];
      expect(issues(cfg), JSON.stringify(extra)).toContainEqual(expect.stringMatching(re));
    }
  });

  it("accepts aspiration 0 (meaning none) and the maximum", () => {
    const cfg = minimal();
    cfg.links = [
      { label: "A", url: "https://a.example", feedme: { id: "a", aspiration: 0 } },
      { label: "B", url: "https://b.example", feedme: { id: "b", aspiration: 1_000_000 } },
    ];
    expect(issues(cfg)).toEqual([]);
  });

  it("rejects unknown fields inside the nested opt-in so typos are caught", () => {
    const cfg = minimal();
    cfg.links = [{ label: "A", url: "https://a.example", feedme: { id: "a", blurbs: "typo" } }];
    expect(issues(cfg)).toContainEqual(expect.stringMatching(/^links\.0\.feedme: Unrecognized key\(s\).*blurbs/));
    expect(issues({ ...minimal(), feedme: { enabled: true, origin: "https://ok.example", token: "nope" } })).toContainEqual(
      expect.stringMatching(/^feedme: Unrecognized key\(s\).*token/),
    );
  });

  it("requires a usable origin only when enabled", () => {
    expect(issues({ ...minimal(), feedme: { enabled: true } })).toEqual([
      expect.stringMatching(/^feedme\.origin: feedme\.origin is required when feedme\.enabled is true/),
    ]);
    expect(issues({ ...minimal(), feedme: { enabled: false, origin: "http://bad.example/path" } })).toEqual([]);
  });

  it.each([
    ["http://tips.example.com", /must use https/],
    ["https://user:pw@tips.example.com", /username or password/],
    ["https://tips.example.com/checkout", /no path/],
    ["https://tips.example.com/?x=1", /query string or fragment/],
    ["https://tips.example.com/#top", /query string or fragment/],
    ["https://localhost:4401", /public host/],
    ["https://127.0.0.1:4401", /public host/],
    ["https://[::1]:4401", /public host/],
    ["https://feedme.localhost", /public host/],
    ["tips.example.com", /absolute https/],
  ])("rejects origin %s", (origin, re) => {
    const out = issues({ ...minimal(), feedme: { enabled: true, origin } });
    expect(out).toContainEqual(expect.stringMatching(re));
    expect(out[0]!.startsWith("feedme.origin:")).toBe(true);
  });

  it("accepts a bare https origin, with or without a trailing slash or port", () => {
    for (const origin of ["https://tips.example.com", "https://tips.example.com/", "https://tips.example.com:8443"]) {
      expect(issues({ ...minimal(), feedme: { enabled: true, origin } })).toEqual([]);
    }
  });
});

describe("libcardSchema — feedme: { skip: true }", () => {
  const enabled = () => ({ ...minimal(), feedme: { enabled: true, origin: "https://tips.example" } });
  const link = (feedme: unknown) => ({ label: "Thing", url: "https://example.com/thing", feedme });

  it("accepts skip on links and socials, and the fixture's skipped link parses as such", () => {
    const r = libcardSchema.safeParse({
      ...enabled(),
      links: [link({ skip: true })],
      socials: [{ platform: "x", url: "https://x.com/ada", feedme: { skip: true } }],
    });
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues, null, 2)).toBe(true);
    expect(r.success && r.data.links[0]!.feedme).toEqual({ skip: true });
    expect(r.success && r.data.socials[0]!.feedme).toEqual({ skip: true });
    const f = libcardSchema.safeParse(fixture());
    expect(f.success && f.data.links.find((l) => l.label === "Privacy policy")?.feedme).toEqual({ skip: true });
  });

  it("rejects skip combined with id, blurb or aspiration", () => {
    for (const extra of [{ id: "thing" }, { blurb: "x" }, { aspiration: 1 }]) {
      const out = issues({ ...enabled(), links: [link({ skip: true, ...extra })] });
      expect(out[0], JSON.stringify(extra)).toMatch(/^links\.0\.feedme\.skip: feedme: \{ skip: true \} takes no other fields/);
    }
  });

  it("still requires an id when skip is absent or false", () => {
    expect(issues({ ...enabled(), links: [link({})] })[0]).toMatch(/^links\.0\.feedme\.id: feedme\.id is required/);
    expect(issues({ ...enabled(), links: [link({ skip: false, blurb: "x" })] })[0]).toMatch(/^links\.0\.feedme\.id: feedme\.id is required/);
    expect(issues({ ...enabled(), links: [link({ skip: false, id: "thing" })] })).toEqual([]);
  });

  it("does not count skipped items toward the opt-in cap or the duplicate check", () => {
    const links = Array.from({ length: FEEDME_MAX_OPT_INS }, (_, i) => link({ id: `t${i}` }));
    links.push(link({ skip: true }), link({ skip: true }));
    expect(issues({ ...enabled(), links })).toEqual([]);
  });
});

describe("libcardSchema — feedme.give (the header CTA toggle)", () => {
  it("defaults to true and accepts false", () => {
    const on = libcardSchema.safeParse({ ...minimal(), feedme: { enabled: true, origin: "https://tips.example" } });
    expect(on.success && on.data.feedme?.give).toBe(true);
    const off = libcardSchema.safeParse({ ...minimal(), feedme: { enabled: true, origin: "https://tips.example", give: false } });
    expect(off.success && off.data.feedme?.give).toBe(false);
  });

  it("rejects a non-boolean", () => {
    expect(issues({ ...minimal(), feedme: { enabled: true, origin: "https://tips.example", give: "no" } })[0]).toMatch(
      /^feedme\.give/,
    );
  });
});

describe("libcardSchema — tip-buttons → Feedme", () => {
  const enabled = () => ({ ...minimal(), feedme: { enabled: true, origin: "https://tips.example" } });
  const tipBlock = (extra: Record<string, unknown> = {}) => ({ type: "tip-buttons", venmo: "ada", ...extra });

  it("defaults feedme to false on an ordinary tip-buttons block", () => {
    const r = libcardSchema.safeParse({ ...minimal(), blocks: [tipBlock()] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.blocks[0]).toEqual({ type: "tip-buttons", venmo: "ada", feedme: false });
  });

  it("accepts feedme: true with the optional label and note when the integration is on", () => {
    const r = libcardSchema.safeParse({
      ...enabled(),
      blocks: [tipBlock({ feedme: true, feedmeLabel: "  Tip me  ", feedmeNote: "  Why here.  " })],
    });
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues, null, 2)).toBe(true);
    expect(r.success && r.data.blocks[0]).toEqual({
      type: "tip-buttons",
      venmo: "ada",
      feedme: true,
      feedmeLabel: "Tip me",
      feedmeNote: "Why here.",
    });
  });

  it("accepts feedmeNote: false (no explainer) and a Feedme-only block", () => {
    const r = libcardSchema.safeParse({ ...enabled(), blocks: [{ type: "tip-buttons", feedme: true, feedmeNote: false }] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.blocks[0]).toEqual({ type: "tip-buttons", feedme: true, feedmeNote: false });
  });

  it("rejects feedme: true when the top-level block is absent, pointing at the block", () => {
    const out = issues({ ...minimal(), blocks: [{ type: "divider" }, tipBlock({ feedme: true })] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^blocks\.1\.feedme: tip-buttons `feedme: true` needs the top-level `feedme:` block/);
  });

  it("rejects feedme: true when the top-level block is disabled", () => {
    const out = issues({ ...minimal(), feedme: { enabled: false }, blocks: [tipBlock({ feedme: true })] });
    expect(out.some((m) => m.startsWith("blocks.0.feedme:"))).toBe(true);
  });

  it("still allows feedme: false on a block while the integration is on", () => {
    expect(issues({ ...enabled(), blocks: [tipBlock({ feedme: false })] })).toEqual([]);
  });

  it("bounds the label and note and rejects unknown fields", () => {
    expect(issues({ ...enabled(), blocks: [tipBlock({ feedme: true, feedmeLabel: "x".repeat(61) })] })[0]).toMatch(
      /^blocks\.0\.feedmeLabel/,
    );
    expect(issues({ ...enabled(), blocks: [tipBlock({ feedme: true, feedmeLabel: "   " })] })[0]).toMatch(
      /^blocks\.0\.feedmeLabel/,
    );
    expect(issues({ ...enabled(), blocks: [tipBlock({ feedme: true, feedmeNote: "x".repeat(281) })] })[0]).toMatch(
      /^blocks\.0\.feedmeNote/,
    );
    expect(issues({ ...enabled(), blocks: [tipBlock({ feedme: true, feedmeNotes: "typo" })] })[0]).toMatch(
      /^blocks\.0: Unrecognized key/,
    );
  });
});

describe("normalizeFeedmeOrigin", () => {
  it("canonicalizes to a bare origin", () => {
    expect(normalizeFeedmeOrigin("https://Tips.Example.com/")).toEqual({ origin: "https://tips.example.com" });
    expect(normalizeFeedmeOrigin("  https://tips.example.com  ")).toEqual({ origin: "https://tips.example.com" });
    expect(normalizeFeedmeOrigin("https://tips.example.com:443")).toEqual({ origin: "https://tips.example.com" });
  });

  it("explains each rejection", () => {
    expect(normalizeFeedmeOrigin(undefined)).toMatchObject({ error: expect.stringMatching(/required/) });
    expect(normalizeFeedmeOrigin("https://a.example/b")).toMatchObject({ error: expect.stringMatching(/remove "\/b"/) });
  });
});

describe("generated libcard.schema.json", () => {
  const schema = JSON.parse(readFileSync(new URL("../../libcard.schema.json", import.meta.url), "utf-8"));
  const root = schema.definitions.LibcardConfig;

  it("exposes the top-level feedme block", () => {
    expect(root.properties.feedme).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
        origin: { type: "string" },
        give: { type: "boolean", default: true },
      },
    });
    expect(root.required ?? []).not.toContain("feedme");
  });

  it("exposes the nested opt-in on links and socials with its constraints", () => {
    for (const where of ["links", "socials"]) {
      const optIn = root.properties[where].items.properties.feedme;
      expect(optIn.additionalProperties).toBe(false);
      // `id` is required unless `skip: true` — a cross-field rule JSON Schema
      // can't express, so neither is listed as required here.
      expect(optIn.required ?? []).toEqual([]);
      expect(optIn.properties.id).toMatchObject({ type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" });
      expect(optIn.properties.skip).toMatchObject({ type: "boolean" });
      expect(optIn.properties.blurb).toMatchObject({ type: "string", maxLength: 240 });
      expect(optIn.properties.aspiration).toMatchObject({ type: "integer", minimum: 0, maximum: 1_000_000 });
    }
  });

  it("exposes the tip-buttons Feedme toggle, label and note", () => {
    const variants = root.properties.blocks.items.anyOf as Array<{ properties: Record<string, any> }>;
    const tips = variants.find((v) => v.properties.type?.const === "tip-buttons");
    expect(tips).toBeDefined();
    expect(tips!.properties.feedme).toMatchObject({ type: "boolean", default: false });
    expect(tips!.properties.feedmeLabel).toMatchObject({ type: "string", minLength: 1, maxLength: 60 });
    expect(JSON.stringify(tips!.properties.feedmeNote)).toMatch(/"maxLength":280/);
    expect(JSON.stringify(tips!.properties.feedmeNote)).toMatch(/"const":false|"enum":\[false\]/);
  });
});
