import { getEntry } from "astro:content";

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

/** The validated config object's type, inferred from the Zod schema. */
export type LibcardConfig = Awaited<ReturnType<typeof getConfig>>;
export type LibcardLink = LibcardConfig["links"][number];
export type LibcardSocial = LibcardConfig["socials"][number];
