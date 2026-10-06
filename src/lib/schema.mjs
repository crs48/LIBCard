// The single source of truth for LibCard's config shape.
//
// Written in plain .mjs (not .ts) on purpose: it is imported BOTH by Astro
// (src/content.config.ts, for build-time validation + types) AND by a plain
// Node script (scripts/generate-schema.mjs, which turns it into the JSON Schema
// that powers editor autocomplete). One schema, two consumers, zero drift.
import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Available theme slugs, read from the generated registry (src/data/themes.json,
 * produced from themes/*.yaml by `pnpm run gen:themes`). Used by the setup wizard
 * to list choices. Falls back to just "default" before the first generation.
 */
export const THEMES = readThemeSlugs();
function readThemeSlugs() {
  try {
    const registry = JSON.parse(readFileSync(new URL("../data/themes.json", import.meta.url), "utf-8"));
    return registry.map((t) => t.slug);
  } catch {
    return ["default"];
  }
}

// `theme:` accepts either a bare slug (one theme, zero client JS) or an object
// that can turn on the live theme switcher. The simple string form stays valid.
const themeConfigSchema = z
  .union([
    z.string().min(1),
    z
      .object({
        name: z.string().min(1),
        switcher: z.boolean().default(false),
        // Pick a random theme on every page load (a fun demo of the gallery).
        // `true` randomizes over the whole cycle; an array curates the pool —
        // only those themes can be landed on at random, while the switcher
        // button still cycles through everything in `allow`/`order`.
        random: z.union([z.boolean(), z.array(z.string().min(1))]).default(false),
        allow: z.array(z.string().min(1)).optional(),
        order: z.array(z.string().min(1)).optional(),
        animate: z.boolean().default(true),
      })
      .strict(),
  ])
  .default("default");

/** Allow a valid value, or an empty string (so users can leave fields blank). */
const optionalEmail = z.union([z.string().email(), z.literal("")]).optional();
const optionalUrl = z.union([z.string().url(), z.literal("")]).optional();

/**
 * The fixed vocabulary for a link's `status:` chip — a small label inside the
 * button that says what state the thing behind the link is in ("Ready",
 * "In progress", "Experiment", …). Fixed on purpose: a shared set of slugs keeps
 * every card's chips consistent (and lets the stylesheet give each one a dot
 * color), while the top-level `statuses:` map lets an owner rephrase any label.
 * Default copy lives in src/lib/status.ts.
 */
export const LINK_STATUSES = ["ready", "wip", "experiment", "exploration", "writing", "reading", "dormant"];


// --- Feedme tips (optional, OFF by default) ---------------------------------
//
// Feedme (https://github.com/crs48/feedme) is a self-hosted tip jar where a
// supporter picks *where* they'd like the creator to spend their energy. LibCard
// only ever links out to it: a "More of this" action beside an opted-in link or
// social opens the creator's Feedme checkout with that target pre-selected, and
// a "Give to <name>" CTA opens it unselected. Every gift is an unconditional tip
// to the creator; the pick is a suggestion, not a purchase or a pledge.
//
// Two pieces of config, both optional:
//   • a top-level `feedme:` block (enabled + the creator's own Feedme origin)
//   • a per-link / per-social `feedme:` object naming the target `id`
// Omit the top-level block (or set `enabled: false`) and NOTHING changes: no
// fetch at build time, no markup, no script. A link or social without its own
// `feedme:` object is never tippable — opt-in is explicit, never inferred from
// a platform, URL, label, or GitHub repo.

/** Target IDs: lowercase slug, 1–64 chars, must start with a letter or digit. */
export const FEEDME_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** `creator` is synthesized by Feedme itself; `amount` is the checkout's price
 *  query parameter. Neither may name a source item. */
export const FEEDME_RESERVED_IDS = ["creator", "amount"];
/** How many links + socials may opt in (Feedme's import limit). Ordinary,
 *  untippable items don't count. */
export const FEEDME_MAX_OPT_INS = 99;
/** `aspiration` is whole US dollars, 0 (= none) through one million. */
export const FEEDME_MAX_ASPIRATION = 1_000_000;

/**
 * Validate + normalize a configured Feedme origin. Returns `{ origin }` with the
 * canonical `https://host[:port]` form (an optional trailing slash is accepted
 * and dropped), or `{ error }` with an actionable message. Only a bare HTTPS
 * origin is allowed — no credentials, no path, no query, no fragment — and
 * never a loopback host: the public card must point at a deployed Feedme, not a
 * local preview. (Tests mock `fetch` rather than relaxing this.)
 */
export function normalizeFeedmeOrigin(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: "feedme.origin is required when feedme.enabled is true (e.g. https://tips.example.com)" };
  }
  const value = raw.trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: `feedme.origin must be an absolute https:// origin, got "${value}"` };
  }
  if (url.protocol !== "https:") return { error: `feedme.origin must use https://, got "${url.protocol}//"` };
  if (url.username || url.password) return { error: "feedme.origin must not contain a username or password" };
  if (/[?#]/.test(value) || url.search || url.hash) return { error: "feedme.origin must not contain a query string or fragment" };
  if (url.pathname !== "/") return { error: `feedme.origin must be a bare origin with no path (remove "${url.pathname}")` };
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\.\d+\.\d+\.\d+$/.test(host)
  ) {
    return { error: `feedme.origin must be a public host, not ${host} — point it at your deployed Feedme` };
  }
  return { origin: url.origin };
}

// The per-item opt-in. `.strict()` so a typo (`blurb:` vs `blurbs:`) is a build
// error rather than a silently ignored field.
const feedmeOptInSchema = z
  .object({
    // The permanent target id Feedme keys payments by. Keep it stable when you
    // rename or re-point the link — changing it archives the old target and
    // creates a new one.
    id: z
      .string()
      .regex(FEEDME_ID_RE, {
        message: "feedme.id must be a lowercase slug: a–z, 0–9 and hyphens, 1–64 chars, starting with a letter or digit",
      })
      .refine((id) => !FEEDME_RESERVED_IDS.includes(id), {
        message: `feedme.id cannot be one of the reserved words: ${FEEDME_RESERVED_IDS.join(", ")}`,
      })
      .describe("Stable target id, unique across links and socials. Lowercase slug, 1–64 chars."),
    // One plain-text sentence shown beside the tip action ("More time in the
    // room with people."). Omitting it is the same as an empty blurb.
    blurb: z.string().trim().max(240).optional().describe("Plain-text blurb, at most 240 characters."),
    // Optional funding aspiration in WHOLE US DOLLARS, imported by Feedme (it can
    // be overridden there). 0 or omitted = none. LibCard records it but does not
    // draw a progress bar — see docs/FEEDME.md.
    aspiration: z
      .number()
      .int({ message: "feedme.aspiration must be a whole number of US dollars" })
      .min(0)
      .max(FEEDME_MAX_ASPIRATION)
      .optional()
      .describe("Optional aspiration in whole US dollars (0–1,000,000). 0 or omitted means none."),
  })
  .strict();

// The top-level switch. Adding `feedme:` with `enabled: true` turns on the
// build-time fetch, the "Give to <name>" CTA and the per-item actions.
const feedmeConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    // Your own deployed Feedme (a bare https:// origin). Required when enabled.
    origin: z.string().optional().describe("Your Feedme origin, e.g. https://tips.example.com — required when enabled."),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) return;
    const result = normalizeFeedmeOrigin(value.origin);
    if (result.error) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["origin"], message: result.error });
  });

/**
 * Whole-document Feedme checks that JSON Schema can't express: target ids must
 * be unique across links AND socials, and at most FEEDME_MAX_OPT_INS items may
 * opt in. Issues carry the exact field path so the error points at the line.
 */
function validateFeedmeOptIns(doc, ctx) {
  const optIns = [];
  (doc.links ?? []).forEach((link, i) => {
    if (link?.feedme) optIns.push({ id: link.feedme.id, path: ["links", i, "feedme", "id"] });
  });
  (doc.socials ?? []).forEach((social, i) => {
    if (social?.feedme) optIns.push({ id: social.feedme.id, path: ["socials", i, "feedme", "id"] });
  });
  if (optIns.length > FEEDME_MAX_OPT_INS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["links"],
      message: `At most ${FEEDME_MAX_OPT_INS} links and socials can opt into Feedme (found ${optIns.length}). Remove the feedme: block from the rest — ordinary links don't count.`,
    });
  }
  const seen = new Map();
  for (const { id, path } of optIns) {
    const first = seen.get(id);
    if (first) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Duplicate feedme.id "${id}" — already used at ${first.join(".")}. Ids must be unique across links and socials.`,
      });
    } else {
      seen.set(id, path);
    }
  }
}

const linkSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().url(),
    icon: z.string().optional(),
    // What state the project/page behind this link is in. Renders a tiny badge
    // (text + colored dot) on the button's top-right corner. Omit for no badge.
    //   ready       — works; others can use it today
    //   wip         — being built; not ready for use yet
    //   experiment  — a playful prototype, may never be "done"
    //   exploration — research / a written deep-dive
    //   writing     — an essay or blog post
    //   reading     — a curated reading list / what you're consuming
    //   dormant     — not being worked on right now
    status: z.enum(LINK_STATUSES).optional(),
    // A companion GitHub repo for this link — e.g. the source behind a live
    // site. Shows a small GitHub pill (the mark + the star count, per `stars`)
    // to the right of the main button, so one row says "here's the site, and
    // here's its code" instead of two separate buttons. Must be a plain repo
    // URL (https://github.com/owner/repo).
    github: z
      .string()
      .url()
      .regex(/^https?:\/\/github\.com\/[^/?#]+\/[^/?#]+?(?:\.git)?\/?$/i, {
        message: "github must be a repo URL like https://github.com/owner/repo",
      })
      .optional(),
    // Show a "★ Star" sub-button when this link's own `url` points at a GitHub
    // repo. It opens the repo (you can't star from another site), so a
    // logged-in visitor lands right on GitHub's own Star button. Ignored for
    // non-repo URLs (e.g. a profile or a deep path). Not needed when `github`
    // is set — that pill shows regardless.
    star: z.boolean().default(false),
    // How (if at all) to show the star count on the pill (either kind):
    //   "off"   — pill only, no number (zero JS, zero third-party request)
    //   "build" — bake the count into the page at build time (zero runtime
    //             cost; refreshed whenever the site rebuilds)
    //   "badge" — a shields.io <img> (no JS, but one third-party request per
    //             visit, so it opts out of LibCard's "nothing to track you")
    // Any value other than "off" implies the pill, so `star` is optional then.
    stars: z.enum(["off", "build", "badge"]).default("off"),
    // Opt this link into Feedme tips ("More of this"). Omit = ordinary link.
    feedme: feedmeOptInSchema.optional(),
  })
  .strict();

const socialSchema = z
  .object({
    platform: z.string().min(1),
    url: z.string().url(),
    label: z.string().optional(),
    // Opt this social into Feedme tips. Omit = ordinary social link.
    feedme: feedmeOptInSchema.optional(),
  })
  .strict();

// `cardMode:` — the landscape "rotate your phone to flash a business card" view.
// Pure CSS by default (zero client JS): the overlay and the portrait hint are
// revealed by an orientation media query. The only JavaScript is the optional
// screen wake lock, shipped solely when `wakeLock: true` (like the theme
// switcher). Omit the whole block to accept the defaults.
const cardModeSchema = z
  .object({
    // Show the landscape card overlay (and the portrait "rotate" hint).
    enabled: z.boolean().default(true),
    // What the card's QR encodes: the link-in-bio page, the offline vCard, or both.
    qr: z.enum(["page", "contact", "both"]).default("page"),
    // The subtle "⟲ Rotate to show your card" nudge shown in portrait on phones.
    hint: z.boolean().default(true),
    // Opt-in: keep the screen lit while the card is shown (ships a tiny script).
    wakeLock: z.boolean().default(false),
  })
  .strict()
  .default({});

// --- Rich content blocks (optional, ordered) -------------------------------
//
// `blocks:` is an ordered list of typed content blocks rendered between the
// links and the social row. Each block is a tight, validated shape — we never
// accept raw HTML/<iframe> from config, so a config file stays "data, not code"
// and is safe to accept from anyone (the same guarantee the theme system relies
// on).
//
// Blocks fall into four tiers by how they render under the zero-JS / zero-server
// promise: (1) pure static HTML/CSS, (2) third-party <form> POST, (3) live
// provider iframes (privacy-safe defaults), and (4) build-time fetched embeds
// (zero runtime JS). See
// docs/explorations/0006_*_RICH_CONTENT_BLOCKS_AND_ZERO_JS_EMBEDS.md.

const imageSchema = z
  .object({
    src: z.string().min(1),
    alt: z.string().optional(),
    href: optionalUrl,
  })
  .strict();

const faqItemSchema = z
  .object({ q: z.string().min(1), a: z.string().min(1) })
  .strict();

const formFieldSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().optional(),
    type: z.enum(["text", "email", "tel", "textarea"]).default("text"),
    required: z.boolean().default(false),
    placeholder: z.string().optional(),
  })
  .strict();

/** Providers handled by the safe iframe builder (src/lib/embeds.ts). */
export const EMBED_PROVIDERS = [
  "spotify",
  "applemusic",
  "soundcloud",
  "bandcamp",
  "figma",
  "twitch",
  "tiktok",
  "bluesky",
  "mastodon",
  "gforms",
  "typeform",
  "airtable",
  "codepen",
  "oembed",
];

const blockSchema = z.discriminatedUnion("type", [
  // Tier 1 — pure static HTML/CSS
  z
    .object({
      type: z.literal("heading"),
      text: z.string().min(1),
      level: z.number().int().min(2).max(4).default(2),
    })
    .strict(),
  z.object({ type: z.literal("text"), markdown: z.string().min(1) }).strict(),
  z.object({ type: z.literal("divider"), label: z.string().optional() }).strict(),
  z
    .object({
      type: z.literal("contact-buttons"),
      // `call`/`email`: true → pull from contact.phone / contact.email; or a
      // literal value to override. sms/whatsapp/telegram/signal: a value.
      call: z.union([z.boolean(), z.string()]).optional(),
      sms: z.string().optional(),
      whatsapp: z.string().optional(),
      telegram: z.string().optional(),
      signal: z.string().optional(),
      email: z.union([z.boolean(), z.string()]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tip-buttons"),
      // Each value is a handle (→ the provider's pay-me link) or a full https URL.
      venmo: z.string().optional(),
      paypal: z.string().optional(),
      wise: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("gallery"),
      images: z.array(imageSchema).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("faq"),
      items: z.array(faqItemSchema).min(1),
    })
    .strict(),
  // Tier 3 — live provider iframes (privacy-safe defaults)
  z
    .object({
      type: z.literal("video"),
      provider: z.enum(["youtube", "vimeo", "loom"]),
      id: z.string().min(1),
      title: z.string().optional(),
      // Default: a pure-HTML click-to-load facade so nothing loads (and nothing
      // tracks) until the visitor clicks. Set false for an eager iframe.
      facade: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("embed"),
      provider: z.enum(EMBED_PROVIDERS),
      url: optionalUrl,
      id: z.string().optional(),
      title: z.string().optional(),
      height: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("booking"),
      provider: z.enum(["calendly", "calcom", "gcal"]),
      url: z.string().url(),
      title: z.string().optional(),
      height: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("map"),
      provider: z.enum(["gmaps", "osm"]).default("gmaps"),
      // The provider's "embed" URL (Google Maps share→embed, or OSM export). We
      // validate the host in the builder; we never inject arbitrary iframes.
      src: z.string().url(),
      title: z.string().optional(),
      height: z.number().int().positive().optional(),
    })
    .strict(),
  // Tier 2 — third-party <form> POST (zero JS, zero backend)
  z
    .object({
      type: z.literal("signup"),
      provider: z.enum(["buttondown", "mailchimp", "kit", "formspree"]),
      username: z.string().optional(),
      action: optionalUrl,
      title: z.string().optional(),
      description: z.string().optional(),
      button: z.string().optional(),
      placeholder: z.string().optional(),
      redirect: optionalUrl,
    })
    .strict(),
  z
    .object({
      type: z.literal("form"),
      action: z.string().url(),
      title: z.string().optional(),
      description: z.string().optional(),
      fields: z.array(formFieldSchema).min(1),
      button: z.string().optional(),
      redirect: optionalUrl,
    })
    .strict(),
  // Tier 4 — build-time fetched embeds (zero runtime JS; refreshed on rebuild)
  z.object({ type: z.literal("tweet"), url: z.string().url() }).strict(),
  z
    .object({
      type: z.literal("rss"),
      url: z.string().url(),
      limit: z.number().int().min(1).max(20).default(5),
      title: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("github"),
      user: z.string().min(1),
      repo: z.string().optional(),
    })
    .strict(),
]);

// --- Privacy-first, cookieless analytics (optional, OFF by default) ----------
//
// Omit this whole block and the page ships ZERO analytics — and, if nothing else
// opts into JS, stays zero-JS, exactly like today. Every supported provider is
// cookieless and (per the vendor) needs no consent banner. Two honesty tiers,
// mirroring the `stars` modes:
//
//   • goatcounter `mode: pixel` — a single <img>. ZERO JavaScript. Counts
//     pageviews + referrers; cannot see outbound clicks.
//   • goatcounter `mode: script`, umami, plausible, cloudflare — a small
//     (~1–2 KB) cookieless beacon that also tracks outbound link clicks.
//
// The provider id/domain/token are PUBLIC identifiers (no secrets), so they live
// happily in this committed file. Like `embed`/`signup`, this is validated data,
// never raw HTML — we only ever emit a known provider's official snippet.
const analyticsSchema = z
  .discriminatedUnion("provider", [
    z
      .object({
        provider: z.literal("goatcounter"),
        // Your GoatCounter code: <code>.goatcounter.com
        code: z.string().min(1),
        // pixel — a no-JS <img> beacon (pageviews + referrers, no clicks);
        // script — the ~3 KB count.js beacon (adds richer data).
        mode: z.enum(["pixel", "script"]).default("pixel"),
      })
      .strict(),
    z
      .object({
        provider: z.literal("umami"),
        websiteId: z.string().min(1),
        src: z.string().url().default("https://cloud.umami.is/script.js"),
        // Auto-tag every outbound link so clicks show up as "outbound" events.
        outboundClicks: z.boolean().default(true),
      })
      .strict(),
    z
      .object({
        provider: z.literal("plausible"),
        // The domain registered in Plausible, e.g. "you.github.io".
        domain: z.string().min(1),
        // The script variant. The default already tracks outbound link clicks.
        src: z.string().url().default("https://plausible.io/js/script.outbound-links.js"),
      })
      .strict(),
    z
      .object({
        provider: z.literal("cloudflare"),
        // Web Analytics beacon token (note: Cloudflare can't track outbound clicks).
        token: z.string().min(1),
      })
      .strict(),
  ])
  .optional();

export const libcardSchema = z.object({
  profile: z
    .object({
      name: z.string().min(1),
      tagline: z.string().optional(),
      avatar: z.string().optional(),
      location: z.string().optional(),
    })
    .strict(),
  contact: z
    .object({
      email: optionalEmail,
      phone: z.string().optional(),
      organization: z.string().optional(),
      title: z.string().optional(),
      website: optionalUrl,
    })
    .strict()
    .default({}),
  links: z.array(linkSchema).default([]),
  // Optional rephrasing of the `status:` chip labels, e.g. `wip: Building`.
  // Every key is optional; anything you leave out keeps its default copy.
  statuses: z
    .object(
      Object.fromEntries(
        LINK_STATUSES.map((slug) => [
          slug,
          z.string().min(1).max(24).optional().describe(`Chip text for links with status: ${slug}`),
        ]),
      ),
    )
    .strict()
    .default({}),
  blocks: z.array(blockSchema).default([]),
  socials: z.array(socialSchema).default([]),
  theme: themeConfigSchema,
  footer: z
    .object({
      // "Powered by LibCard" — on by default, but yours to turn off (MIT).
      poweredBy: z.boolean().default(true),
      // "Theme by <author>" — on by default. Setting this false only hides the
      // credit for permissively-licensed themes (MIT/CC0/…). Themes under a
      // license that requires attribution (e.g. CC-BY-4.0) keep their credit.
      themeCredit: z.boolean().default(true),
    })
    .strict()
    .default({}),
  seo: z
    .object({
      description: z.string().optional(),
      ogImage: z.string().optional(),
    })
    .strict()
    .default({}),
  // Page metadata. `default: true` marks an unedited/template card and shows a
  // subtle one-line "edit me" nudge on the page — handy right after "Use this
  // template". It's OFF by default, so a real, customized card never shows it;
  // remove the marker (or set it false) once you've made the card yours.
  meta: z
    .object({
      default: z.boolean().default(false),
    })
    .strict()
    .default({}),
  cardMode: cardModeSchema,
  analytics: analyticsSchema,
  // Optional Feedme tip integration. Absent = off: no fetch, no markup.
  feedme: feedmeConfigSchema.optional(),
  site: z
    .object({
      url: z.string().url(),
      base: z.string().default("/"),
    })
    .strict(),
})
  // Cross-field rules (unique feedme ids, opt-in cap). Runs only once every
  // field above has parsed, so it always sees fully-shaped data.
  .superRefine(validateFeedmeOptIns);
// NOTE: the top-level object is intentionally NOT `.strict()` — Astro's content
// loader injects an `id` field, and nested objects already catch field typos.
