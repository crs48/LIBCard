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
  site: z
    .object({
      url: z.string().url(),
      base: z.string().default("/"),
    })
    .strict(),
});
// NOTE: the top-level object is intentionally NOT `.strict()` — Astro's content
// loader injects an `id` field, and nested objects already catch field typos.
