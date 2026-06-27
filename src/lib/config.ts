import { getEntry } from "astro:content";
import { resolveTheme, type ResolvedTheme } from "./themes";

/**
 * Typed accessor for the validated LibCard config. Call this from any `.astro`
 * component or page frontmatter:
 *
 *   const config = await getConfig();
 *   config.profile.name;  // fully typed, validated at build time
 */
export async function getConfig() {
  const entry = await getEntry("libcard", "libcard");
  if (!entry) {
    throw new Error(
      "Could not load libcard.config.yaml. Make sure the file exists at the repo root.",
    );
  }
  return entry.data;
}

/**
 * The active theme, normalized from the config's string|object `theme` field
 * (and validated against the generated registry). Use this anywhere you need the
 * resolved theme — the Layout bakes `name` into `<html data-theme>`, the footer
 * reads its author, and the switcher cycles `cycle`.
 */
export async function getActiveTheme(): Promise<ResolvedTheme> {
  const cfg = await getConfig();
  return resolveTheme(cfg.theme);
}

/**
 * The resolved landscape "card mode" settings. The Zod schema already applies
 * every default, so this is a thin, typed accessor the Layout uses to decide
 * whether to mount the overlay (and whether to ship the opt-in wake-lock script).
 */
export async function getCardMode(): Promise<LibcardConfig["cardMode"]> {
  const cfg = await getConfig();
  return cfg.cardMode;
}

/** The validated config object's type, inferred from the Zod schema. */
export type LibcardConfig = Awaited<ReturnType<typeof getConfig>>;
export type LibcardLink = LibcardConfig["links"][number];
export type LibcardSocial = LibcardConfig["socials"][number];
export type LibcardCardMode = LibcardConfig["cardMode"];
