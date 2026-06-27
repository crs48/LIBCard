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

const linkSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().url(),
    icon: z.string().optional(),
    // Show a "★ Star" sub-button when this link points at a GitHub repo. It
    // opens the repo (you can't star from another site), so a logged-in
    // visitor lands right on GitHub's own Star button. Ignored for non-repo
    // URLs (e.g. a profile or a deep path).
    star: z.boolean().default(false),
    // How (if at all) to show the star count next to the pill:
    //   "off"   — pill only, no number (zero JS, zero third-party request)
    //   "build" — bake the count into the page at build time (zero runtime
    //             cost; refreshed whenever the site rebuilds)
    //   "badge" — a shields.io <img> (no JS, but one third-party request per
    //             visit, so it opts out of LibCard's "nothing to track you")
    // Any value other than "off" implies the pill, so `star` is optional then.
    stars: z.enum(["off", "build", "badge"]).default("off"),
  })
  .strict();

const socialSchema = z
  .object({
    platform: z.string().min(1),
    url: z.string().url(),
    label: z.string().optional(),
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
  site: z
    .object({
      url: z.string().url(),
      base: z.string().default("/"),
    })
    .strict(),
});
// NOTE: the top-level object is intentionally NOT `.strict()` — Astro's content
// loader injects an `id` field, and nested objects already catch field typos.
