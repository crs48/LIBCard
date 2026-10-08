// Feedme tips — the optional "More of this" integration (see schema.mjs for the
// config contract and docs/FEEDME.md for the end-to-end setup).
//
// LibCard's whole job here is to LINK OUT. Feedme owns checkout, identity,
// payment verification, privacy, accounting and recovery; this module only
//
//   1. builds checkout URLs from the creator's configured origin, and
//   2. fetches Feedme's public, allowlisted aggregate endpoint ONCE per build
//      and bakes the validated numbers into the static page.
//
// Nothing here runs in the browser. The fetch is fail-soft: any network, HTTP,
// size, JSON or shape problem logs one line and the card still builds — with
// the configured tip links intact and the public numbers simply omitted. The
// page never claims "0 picks" when the truth is "we couldn't ask".
//
// No secrets belong here: the request carries no cookies, no Authorization
// header, and never LibCard's GITHUB_TOKEN.

import { normalizeFeedmeOrigin, FEEDME_ID_RE } from "./schema.mjs";

/** Feedme's public aggregate endpoint (relative to the configured origin). */
export const FEEDME_ENDPOINT_PATH = "/api/public/libcard";
/** Give up on the public endpoint after this long; the build must not hang. */
export const FEEDME_TIMEOUT_MS = 5000;
/** Largest response body we'll read (enforced while streaming, so a missing
 *  Content-Length can't sneak a bigger one past us). */
export const FEEDME_MAX_BODY_BYTES = 256 * 1024;
/** Feedme caps its public target list at 99 source items + the creator. */
export const FEEDME_MAX_TARGETS = 100;
/** Feedme's current acceptable tip range, in US cents. */
export const FEEDME_MIN_AMOUNT_CENTS = 100;
export const FEEDME_MAX_AMOUNT_CENTS = 100_000;
/** Same-origin redirects we'll follow before giving up. */
const MAX_REDIRECTS = 3;
const USER_AGENT = "LibCard (+https://github.com/crs48/LIBCard)";

export type FeedmeTargetKind = "creator" | "link" | "social";
const TARGET_KINDS: ReadonlySet<string> = new Set<FeedmeTargetKind>(["creator", "link", "social"]);

/** One live target as the public endpoint reports it (validated + bounded). */
export interface FeedmeTarget {
  id: string;
  label: string;
  url: string | null;
  kind: FeedmeTargetKind;
  /** Distinct eligible payments that selected this target. NOT unique people. */
  publicCount: number;
  /** This target's share of raw picks among live targets, in thousandths:
   *  750 = 75%, 1 = 0.1%. All targets total exactly 1000, or all are 0. */
  publicShareMillis: number;
}

/** The validated public response. Unknown fields are dropped on purpose. */
export interface FeedmePublic {
  creatorName: string;
  origin: string;
  /** Feedme's configured second tip suggestion, in US cents (2200 = $22). */
  defaultAmountCents: number;
  targets: FeedmeTarget[];
}

export type FeedmeParseResult = { ok: true; data: FeedmePublic } | { ok: false; error: string };

// --- URLs -------------------------------------------------------------------

/** The public endpoint URL for a (normalized) origin. */
export function feedmeEndpoint(origin: string): string {
  return new URL(FEEDME_ENDPOINT_PATH, origin).href;
}

/**
 * The "More of this" link: Feedme's checkout with `id` pre-selected (one pick)
 * and, when the endpoint told us Feedme's default, that amount suggested in
 * DOLLARS (2200 cents → `amount=22.00`). Omit `defaultAmountCents` after a
 * failed fetch and Feedme fills in its own current default.
 *
 * Always built from the validated configured origin — never from an item's
 * destination URL or a response host — and never prefixed with Astro's `base`.
 */
export function tipUrl(origin: string, id: string, defaultAmountCents?: number): string {
  const url = new URL("/checkout", origin);
  if (defaultAmountCents !== undefined) {
    url.searchParams.set("amount", (defaultAmountCents / 100).toFixed(2));
  }
  url.searchParams.set(id, "1");
  return url.href;
}

/** The general "Give to <name>" CTA: checkout with nothing selected, so the
 *  visitor chooses on Feedme. No query string at all. */
export function checkoutUrl(origin: string): string {
  return new URL("/checkout", origin).href;
}

/** A "Just <first name>" shortcut: explicitly selects Feedme's synthesized
 *  `creator` target. Distinct from the unselected general CTA above. */
export function creatorTipUrl(origin: string, defaultAmountCents?: number): string {
  return tipUrl(origin, "creator", defaultAmountCents);
}

/** The host a (normalized) origin points at, for copy like "Tip at crs.tips". */
export function feedmeHost(origin: string): string {
  return new URL(origin).host;
}

// --- Copy -------------------------------------------------------------------

/** 750 → "75%", 1 → "0.1%", 125 → "12.5%", 1000 → "100%". One decimal at most. */
export function formatShare(millis: number): string {
  return `${(millis / 10).toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * The public-signal caption for a live target, e.g.
 * "75% of public picks · 1 public tip". Counts are *payments*, so the noun is
 * "tip", never "supporter". Genuine zero signal reads "No public picks yet" —
 * only ever shown when the endpoint actually answered.
 */
export function formatSignal(target: Pick<FeedmeTarget, "publicCount" | "publicShareMillis">): string {
  if (target.publicCount === 0 && target.publicShareMillis === 0) return "No public picks yet";
  const tips = `${target.publicCount} public ${target.publicCount === 1 ? "tip" : "tips"}`;
  return `${formatShare(target.publicShareMillis)} of public picks · ${tips}`;
}

/** A readable name for a social that has no `label:` ("x" → "X"). */
const PLATFORM_NAMES: Record<string, string> = {
  x: "X",
  github: "GitHub",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  paypal: "PayPal",
  soundcloud: "SoundCloud",
};
export function socialDisplayName(social: { platform: string; label?: string }): string {
  if (social.label) return social.label;
  return PLATFORM_NAMES[social.platform] ?? social.platform.charAt(0).toUpperCase() + social.platform.slice(1);
}

// --- Response validation ----------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isBoundedString = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/**
 * Validate the public endpoint's JSON into {@link FeedmePublic}. Pure — no I/O.
 * Strict about required fields (a malformed response is "unavailable", not
 * "zero"), lenient about extra ones (forward compatibility). The response's own
 * `origin` must normalize to the configured origin, so a misrouted or spoofed
 * reply can't attach foreign numbers to this card.
 */
export function parseFeedmePublic(json: unknown, configuredOrigin: string): FeedmeParseResult {
  const fail = (error: string): FeedmeParseResult => ({ ok: false, error });
  if (!isRecord(json)) return fail("response is not a JSON object");

  if (!isBoundedString(json.creatorName, 200)) return fail("creatorName missing or too long");

  if (typeof json.origin !== "string") return fail("origin missing");
  const origin = normalizeFeedmeOrigin(json.origin);
  if ("error" in origin) return fail(`origin is not a valid https origin: ${origin.error}`);
  if (origin.origin !== configuredOrigin) {
    return fail(`origin mismatch: response says ${origin.origin}, config says ${configuredOrigin}`);
  }

  const amount = json.defaultAmountCents;
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount < FEEDME_MIN_AMOUNT_CENTS ||
    amount > FEEDME_MAX_AMOUNT_CENTS
  ) {
    return fail("defaultAmountCents must be an integer between 100 and 100000");
  }

  if (!Array.isArray(json.targets)) return fail("targets missing");
  if (json.targets.length > FEEDME_MAX_TARGETS) return fail(`too many targets (${json.targets.length} > ${FEEDME_MAX_TARGETS})`);

  const targets: FeedmeTarget[] = [];
  const seen = new Set<string>();
  let shareTotal = 0;
  for (const [i, raw] of json.targets.entries()) {
    const at = `targets[${i}]`;
    if (!isRecord(raw)) return fail(`${at} is not an object`);
    if (typeof raw.id !== "string" || !FEEDME_ID_RE.test(raw.id)) return fail(`${at}.id is not a valid target id`);
    if (seen.has(raw.id)) return fail(`duplicate target id "${raw.id}"`);
    seen.add(raw.id);
    if (!isBoundedString(raw.label, 200)) return fail(`${at}.label missing or too long`);
    if (!(raw.url === null || isBoundedString(raw.url, 2048))) return fail(`${at}.url must be a string or null`);
    if (typeof raw.kind !== "string" || !TARGET_KINDS.has(raw.kind)) return fail(`${at}.kind is not recognized`);
    if (!isCount(raw.publicCount)) return fail(`${at}.publicCount must be a non-negative integer`);
    const share = raw.publicShareMillis;
    if (typeof share !== "number" || !Number.isInteger(share) || share < 0 || share > 1000) {
      return fail(`${at}.publicShareMillis must be an integer from 0 to 1000`);
    }
    shareTotal += share;
    targets.push({
      id: raw.id,
      label: raw.label,
      url: raw.url,
      kind: raw.kind as FeedmeTargetKind,
      publicCount: raw.publicCount,
      publicShareMillis: share,
    });
  }
  if (shareTotal !== 0 && shareTotal !== 1000) return fail(`publicShareMillis total ${shareTotal}, expected 0 or 1000`);

  return {
    ok: true,
    data: { creatorName: json.creatorName, origin: origin.origin, defaultAmountCents: amount, targets },
  };
}

// --- Build-time fetch -------------------------------------------------------

export interface FeedmeFetchOptions {
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** Where the one-line diagnostic goes; defaults to console.warn. */
  warn?: (message: string) => void;
}

/** Read a body to a string, aborting as soon as it exceeds `maxBytes`. */
async function readBounded(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`response body is ${declared} bytes (limit ${maxBytes})`);
  }
  if (!res.body) {
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`response body exceeds ${maxBytes} bytes`);
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      reader.cancel().catch(() => {});
      throw new Error(`response body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function fetchOnce(origin: string, opts: FeedmeFetchOptions): Promise<FeedmePublic | null> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? FEEDME_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? FEEDME_MAX_BODY_BYTES;
  const warn = opts.warn ?? ((m: string) => console.warn(m));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
  let url = feedmeEndpoint(origin);
  try {
    for (let hop = 0; ; hop++) {
      // Deliberately minimal request: no cookies/credentials, no auth header,
      // no environment secrets. Redirects are handled by hand so we can refuse
      // one that leaves the configured origin.
      const res = await doFetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "manual",
        credentials: "omit",
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error(`HTTP ${res.status} redirect without a Location header`);
        const next = new URL(location, url);
        if (next.origin !== origin) throw new Error(`refused redirect to another origin (${next.origin})`);
        if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
        url = next.href;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await readBounded(res, maxBytes);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("response is not valid JSON");
      }
      const parsed = parseFeedmePublic(json, origin);
      if (!parsed.ok) throw new Error(`unexpected response shape: ${parsed.error}`);
      return parsed.data;
    }
  } catch (err) {
    const reason =
      controller.signal.aborted && controller.signal.reason instanceof Error
        ? controller.signal.reason.message
        : err instanceof Error
          ? err.message
          : String(err);
    warn(
      `[libcard] Feedme public stats unavailable from ${origin} (${reason}). ` +
        "Tip links still render; public pick numbers are omitted for this build.",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// One request per origin per build, failures included — the Profile, every
// LinkButton and the SocialRow all read the same promise.
const cache = new Map<string, Promise<FeedmePublic | null>>();

/**
 * Fetch + validate the public endpoint for a configured origin (any form the
 * schema accepts; it's normalized here). Resolves to `null` — never throws —
 * when the numbers are unavailable for any reason.
 */
export function fetchFeedmePublic(origin: string, opts: FeedmeFetchOptions = {}): Promise<FeedmePublic | null> {
  const normalized = normalizeFeedmeOrigin(origin);
  if ("error" in normalized) return Promise.resolve(null);
  const hit = cache.get(normalized.origin);
  if (hit) return hit;
  const pending = fetchOnce(normalized.origin, opts);
  cache.set(normalized.origin, pending);
  return pending;
}

/** Test hook: forget cached responses so each case can mock afresh. */
export function clearFeedmeCache(): void {
  cache.clear();
}

// --- Joining the config to the response -------------------------------------

/** Everything a component needs to render Feedme affordances for one card. */
export interface FeedmeState {
  /** The normalized configured origin — the only host checkout links use. */
  origin: string;
  /** The validated public response, or null when it was unavailable. */
  data: FeedmePublic | null;
}

/** The subset of the config the integration reads. */
export interface FeedmeConfigLike {
  feedme?: { enabled: boolean; origin?: string } | undefined;
}

/**
 * Resolve the integration for a build: `null` when the owner hasn't enabled it
 * (the default for everyone — then nothing is fetched and nothing renders).
 */
export async function loadFeedme(cfg: FeedmeConfigLike, opts: FeedmeFetchOptions = {}): Promise<FeedmeState | null> {
  if (!cfg.feedme?.enabled) return null;
  const normalized = normalizeFeedmeOrigin(cfg.feedme.origin);
  if ("error" in normalized) return null; // the schema already rejected this
  const data = await fetchFeedmePublic(normalized.origin, opts);
  return { origin: normalized.origin, data };
}

/** The per-item "More of this" action, ready to render. */
export interface TipAction {
  href: string;
  /** Accessible name, e.g. "Support more of Digital Garden". */
  ariaLabel: string;
  /** The owner's blurb, or undefined. Render as escaped text only. */
  blurb?: string;
  /** Human copy for the public signal, or null when unavailable. */
  signal: string | null;
  /** "75%" etc., or null when unavailable. */
  share: string | null;
  /** The live target, when the endpoint reported it. */
  target: FeedmeTarget | null;
}

/** A link or social as the config types it (only the fields we read). */
export interface TippableItem {
  feedme?:
    | { id?: string | undefined; skip?: boolean | undefined; blurb?: string | undefined; aspiration?: number | undefined }
    | undefined;
}

/**
 * Decide whether an item gets a "More of this" action, joining by STABLE ID and
 * MATCHING KIND — never by label or destination. The matrix:
 *
 *   integration off / item not opted in      → null (ordinary link)
 *   item carries `feedme: { skip: true }`     → null (kept off Feedme entirely)
 *   endpoint answered, id live for this kind → action with Feedme's default amount + numbers
 *   endpoint answered, id absent/other kind   → null (hidden; destination untouched)
 *   endpoint unavailable                      → action without `amount`, no numbers
 */
export function tipActionFor(
  state: FeedmeState | null,
  kind: Exclude<FeedmeTargetKind, "creator">,
  item: TippableItem,
  displayName: string,
): TipAction | null {
  if (!state || !item.feedme || item.feedme.skip || item.feedme.id === undefined) return null;
  const { id } = item.feedme;
  const blurb = item.feedme.blurb?.trim() || undefined;
  const ariaLabel = `Support more of ${displayName}`;

  if (!state.data) {
    return { href: tipUrl(state.origin, id), ariaLabel, blurb, signal: null, share: null, target: null };
  }
  const target = state.data.targets.find((t) => t.id === id && t.kind === kind);
  if (!target) return null;
  return {
    href: tipUrl(state.origin, id, state.data.defaultAmountCents),
    ariaLabel,
    blurb,
    signal: formatSignal(target),
    share: formatShare(target.publicShareMillis),
    target,
  };
}

/**
 * The built-in explainer under a `tip-buttons` block's Feedme button — the
 * honest pitch for tipping here rather than through a generic pay-me link.
 * Every claim holds for any Feedme: picks are a signal, not a purchase; the
 * code is MIT; Feedme itself adds no application fee (Stripe's still applies).
 */
export const FEEDME_TIP_NOTE =
  "Pick what you'd like more of, and your tip doubles as a vote. Open source, and Feedme adds no fee of its own.";

/** The `tip-buttons` block's primary Feedme button, ready to render. */
export interface TipBlockAction {
  /** The unselected checkout — the visitor chooses their picks on Feedme. */
  href: string;
  /** Button text: the owner's `feedmeLabel`, else "Tip at <host>". */
  label: string;
  /** The Feedme host, e.g. "crs.tips". */
  host: string;
  /** Explainer copy, or null when the owner set `feedmeNote: false`. */
  note: string | null;
}

/** The subset of a `tip-buttons` block the integration reads. */
export interface TipBlockLike {
  feedme?: boolean | undefined;
  feedmeLabel?: string | undefined;
  feedmeNote?: string | false | undefined;
}

/**
 * Resolve the primary Feedme button for a `tip-buttons` block: `null` unless
 * the block opted in AND the integration is on. Independent of the public
 * endpoint — the checkout link needs only the configured origin, so the button
 * renders even when the build couldn't fetch the numbers.
 */
export function tipBlockFor(state: FeedmeState | null, block: TipBlockLike): TipBlockAction | null {
  if (!state || !block.feedme) return null;
  const host = feedmeHost(state.origin);
  const custom = block.feedmeNote;
  const note = custom === false ? null : custom?.trim() || FEEDME_TIP_NOTE;
  return {
    href: checkoutUrl(state.origin),
    label: block.feedmeLabel?.trim() || `Tip at ${host}`,
    host,
    note,
  };
}

/** The synthesized `creator` target, when the endpoint reported one. */
export function creatorTarget(state: FeedmeState | null): FeedmeTarget | null {
  return state?.data?.targets.find((t) => t.id === "creator" && t.kind === "creator") ?? null;
}
