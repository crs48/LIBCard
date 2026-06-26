// Typed accessors over the generated theme registry (src/data/themes.json), for
// use from .astro components and pages. The registry itself is produced from
// themes/*.yaml by `pnpm run gen:themes`. Node scripts use theme-schema.mjs (the
// Zod schema + CSS generator) instead — this file is the Astro-facing half.
import themesData from "../data/themes.json";

export interface ThemeTokens {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  accent: string;
  accentContrast: string;
  border: string;
  font: "sans" | "serif" | "mono" | "rounded";
  radius: string;
}

export interface ThemeMeta {
  slug: string;
  name: string;
  author: string;
  authorUrl: string;
  license: string;
  official: boolean;
  mode: "light" | "dark";
  tags: string[];
  description: string;
  preview: string;
  tokens: ThemeTokens;
}

/** Every shipped theme, in display order (default first, then official, A→Z). */
export const themes = themesData as ThemeMeta[];

const bySlug = new Map(themes.map((t) => [t.slug, t]));

/** Look up one theme's metadata by slug. */
export function getThemeMeta(slug: string): ThemeMeta | undefined {
  return bySlug.get(slug);
}

// Permissive licenses where keeping the "Theme by" credit is goodwill, not a
// legal condition. Anything else (CC-BY*, copyleft, …) requires attribution, so
// the credit can't be turned off via config.
const ATTRIBUTION_FREE = /^(MIT|CC0(-1\.0)?|Unlicense|0BSD|ISC|BSD-[23]-Clause|WTFPL)$/i;

/** True if `license` legally requires the theme author be credited. */
export function licenseRequiresAttribution(license: string): boolean {
  return !ATTRIBUTION_FREE.test(license.trim());
}

/** The config's `theme:` field — a bare slug, or the object switcher form. */
export type ThemeConfig =
  | string
  | {
      name: string;
      switcher?: boolean;
      random?: boolean;
      allow?: string[];
      order?: string[];
      animate?: boolean;
    };

export interface ResolvedTheme {
  /** Owner's default theme slug — server-rendered into <html data-theme>. */
  name: string;
  /** Whether to ship the live switcher island (and its tiny script). */
  switcher: boolean;
  /** Pick a random theme from `cycle` on every page load. */
  random: boolean;
  /** Animate theme changes with the View Transitions API when supported. */
  animate: boolean;
  /** The ordered ring of theme slugs the switcher cycles through. */
  cycle: string[];
}

/**
 * Normalize the string|object `theme` config into a single shape, and fail the
 * build with a readable message if it names a theme that doesn't exist. This is
 * where an unknown/typo'd theme is caught (the schema no longer hard-codes the
 * enum, so the registry is the source of truth).
 */
export function resolveTheme(theme: ThemeConfig): ResolvedTheme {
  const obj = typeof theme === "string" ? { name: theme } : theme;
  const available = themes.map((t) => t.slug).join(", ");

  if (!bySlug.has(obj.name)) {
    throw new Error(`Unknown theme "${obj.name}" in libcard.config.yaml. Available: ${available}.`);
  }

  const allow = obj.allow ?? themes.map((t) => t.slug);
  let cycle = obj.order ?? allow;
  for (const slug of cycle) {
    if (!bySlug.has(slug)) {
      const field = obj.order ? "order" : "allow";
      throw new Error(`theme.${field} lists unknown theme "${slug}". Available: ${available}.`);
    }
  }
  // Always keep the owner's default in the ring so cycling can return to it.
  if (!cycle.includes(obj.name)) cycle = [obj.name, ...cycle];

  return {
    name: obj.name,
    switcher: typeof theme === "string" ? false : (obj.switcher ?? false),
    random: typeof theme === "string" ? false : (obj.random ?? false),
    animate: typeof theme === "string" ? true : (obj.animate ?? true),
    cycle,
  };
}
