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
        random: z.boolean().default(false),
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
