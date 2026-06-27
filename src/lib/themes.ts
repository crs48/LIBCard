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
  /** Source filename in themes/ (e.g. "midnight.yaml") — used to link the theme. */
  file: string;
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

/** The LibCard gallery repo — where themes live and are credited. */
export const LIBCARD_REPO = "https://github.com/crs48/LIBCard";

/** Link to a theme's source file in the gallery, e.g. for the footer credit. */
export function themeSourceUrl(file: string): string {
  return `${LIBCARD_REPO}/blob/main/themes/${file}`;
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
      /** `true` randomizes over the whole cycle; an array curates the pool. */
      random?: boolean | string[];
      allow?: string[];
      order?: string[];
      animate?: boolean;
    };

export interface ResolvedTheme {
  /** Owner's default theme slug — server-rendered into <html data-theme>. */
  name: string;
  /** Whether to ship the live switcher island (and its tiny script). */
  switcher: boolean;
  /** Pick a random theme from `randomPool` on every page load. */
  random: boolean;
  /** Animate theme changes with the View Transitions API when supported. */
  animate: boolean;
  /** The ordered ring of theme slugs the switcher cycles through. */
  cycle: string[];
  /** Themes the random picker draws from — a curated subset, or the full cycle
   *  when `random: true`. Empty when random mode is off. The switcher ring
   *  (`cycle`) is independent, so it can rotate past these. */
  randomPool: string[];
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

  // The random picker has its own pool, decoupled from the switcher ring: an
  // explicit curated array (only those land at random), or — when `random: true`
  // — the full cycle. `random: false`/absent (or an empty array) turns it off.
  const randomCfg = typeof theme === "string" ? false : (obj.random ?? false);
  let randomPool: string[];
  if (Array.isArray(randomCfg)) {
    for (const slug of randomCfg) {
      if (!bySlug.has(slug)) {
        throw new Error(`theme.random lists unknown theme "${slug}". Available: ${available}.`);
      }
    }
    randomPool = randomCfg;
  } else {
    randomPool = randomCfg ? cycle : [];
  }

  return {
    name: obj.name,
    switcher: typeof theme === "string" ? false : (obj.switcher ?? false),
    random: randomPool.length > 0,
    animate: typeof theme === "string" ? true : (obj.animate ?? true),
    cycle,
    randomPool,
  };
}
