// The single source of truth for LibCard's config shape.
//
// Written in plain .mjs (not .ts) on purpose: it is imported BOTH by Astro
// (src/content.config.ts, for build-time validation + types) AND by a plain
// Node script (scripts/generate-schema.mjs, which turns it into the JSON Schema
// that powers editor autocomplete). One schema, two consumers, zero drift.
import { z } from "zod";

/** Built-in theme names. Keep in sync with src/themes/*.css. */
export const THEMES = ["default", "midnight", "sunset", "mono"];

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
  theme: z.enum(THEMES).default("default"),
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
