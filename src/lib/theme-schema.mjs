// The theme system's single source of truth — the v1 token contract, the Zod
// schema every `themes/*.yaml` file is validated against, and the one function
// that turns a validated theme into CSS.
//
// Written in plain .mjs for the same reason as schema.mjs: it is imported BOTH
// by Astro (src/lib/themes.ts / pages, for build-time types) AND by plain Node
// scripts (scripts/gen-themes.mjs, check-contrast.mjs, shoot-themes.mjs). One
// schema, many consumers, zero drift.
//
// SECURITY: a theme is *data, not code*. Authors never write raw CSS — they fill
// in a fixed set of tokens whose values are constrained (hex colors, a font
// enum, a length). The generator below is the ONLY place those tokens become
// CSS, and it only ever emits `--lc-*: <validated value>` declarations. There is
// no path by which a community theme PR can inject arbitrary CSS or JS into a
// forked, GitHub-Pages-hosted card.
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

/**
 * The v1 token contract. Each entry maps a YAML token key → the `--lc-*` CSS
 * custom property the rest of the styles already consume (see global.css). Keep
 * this list frozen; new tokens may be ADDED later (with defaults) but existing
 * ones must keep working so old themes stay valid.
 */
export const TOKEN_CONTRACT = [
  { key: "bg", cssVar: "--lc-bg", kind: "color", doc: "Page background" },
  { key: "surface", cssVar: "--lc-surface", kind: "color", doc: "Card / button background" },
  { key: "fg", cssVar: "--lc-fg", kind: "color", doc: "Primary text" },
  { key: "muted", cssVar: "--lc-muted", kind: "color", doc: "Secondary / muted text" },
  { key: "accent", cssVar: "--lc-accent", kind: "color", doc: "Links, primary buttons, focus rings" },
  { key: "accentContrast", cssVar: "--lc-accent-contrast", kind: "color", doc: "Text/icon on top of accent" },
  { key: "border", cssVar: "--lc-border", kind: "color", doc: "Hairlines, card borders, dividers" },
  { key: "font", cssVar: "--lc-font", kind: "font", doc: "Font family (one of the allowlisted stacks)" },
  { key: "radius", cssVar: "--lc-radius", kind: "radius", doc: "Corner radius for cards & buttons" },
];

/** Allowlisted font stacks. Authors pick a name; we own the (network-free) stack. */
export const FONT_STACKS = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, sans-serif',
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LENGTH = /^\d*\.?\d+(px|rem|em)$/;

const color = z.string().regex(HEX, "must be a hex color like #1a2b3c");

/** The token map every theme must provide. Colors required; font/radius default. */
export const tokensSchema = z
  .object({
    bg: color,
    surface: color,
    fg: color,
    muted: color,
    accent: color,
    accentContrast: color,
    border: color,
    font: z.enum(["sans", "serif", "mono", "rounded"]).default("sans"),
    radius: z.string().regex(LENGTH, 'must be a CSS length like "1rem" or "8px"').default("1rem"),
  })
  .strict();

/** A full theme manifest: metadata (incl. attribution) + the token map. */
export const themeSchema = z
  .object({
    name: z.string().min(1),
    // Optional — defaults to the filename. Lowercase kebab so it's a safe
    // `data-theme` value, CSS selector, and URL fragment.
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and dashes only")
      .optional(),
    author: z.string().min(1),
    authorUrl: z.union([z.string().url(), z.literal("")]).optional(),
    license: z.string().default("CC-BY-4.0"), // SPDX identifier
    official: z.boolean().default(false),
    mode: z.enum(["light", "dark"]).default("light"),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
    tokens: tokensSchema,
  })
  .strict();

/** Files in `themes/` that are templates/examples, not shipped themes. */
const EXAMPLE_SLUGS = new Set(["community-example"]);

/**
 * Read, validate, and normalize every `themes/*.yaml` file in `dir`.
 * Throws a readable error if any theme is invalid (this is what fails the build
 * and the theme-CI check). Example/template files are validated too but flagged
 * `isExample` so callers can keep them out of the shipped registry.
 *
 * @returns {Array<{ slug: string, isExample: boolean } & import("zod").infer<typeof themeSchema>>}
 */
export function loadThemes(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  const themes = [];
  for (const file of files) {
    const slugFromFile = file.replace(/\.ya?ml$/, "");
    const raw = readFileSync(`${dir}/${file}`, "utf-8");
    let parsed;
    try {
      parsed = themeSchema.parse(parse(raw));
    } catch (err) {
      const detail = err?.errors
        ? err.errors.map((e) => `  • ${e.path.join(".") || "(root)"}: ${e.message}`).join("\n")
        : String(err);
      throw new Error(`Invalid theme "themes/${file}":\n${detail}`);
    }
    const slug = parsed.slug ?? slugFromFile;
    themes.push({ ...parsed, slug, file, isExample: EXAMPLE_SLUGS.has(slug) });
  }

  // Default theme first (it's the CSS :root fallback), then official, then A→Z.
  return themes.sort((a, b) => {
    if (a.slug === "default") return -1;
    if (b.slug === "default") return 1;
    if (a.official !== b.official) return a.official ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });
}

/** A compact, serializable registry entry — what ends up in src/data/themes.json. */
export function toRegistryEntry(theme) {
  return {
    slug: theme.slug,
    name: theme.name,
    file: theme.file, // source filename in themes/, for linking to the theme's source
    author: theme.author,
    authorUrl: theme.authorUrl || "",
    license: theme.license,
    official: theme.official,
    mode: theme.mode,
    tags: theme.tags,
    description: theme.description ?? "",
    preview: `themes/.previews/${theme.slug}.png`,
    // Raw token values, so non-CSS consumers (the OG image, contrast checks) can
    // read a theme's colors without re-parsing the YAML.
    tokens: theme.tokens,
  };
}

/**
 * Render one validated theme to a scoped CSS block. This is the ONLY producer of
 * theme CSS in the project — every declaration is a whitelisted `--lc-*` token
 * set to a value the schema already validated.
 */
export function themeToCss(theme) {
  const decls = TOKEN_CONTRACT.map(({ key, cssVar, kind }) => {
    const value = theme.tokens[key];
    const css = kind === "font" ? FONT_STACKS[value] : value;
    return `  ${cssVar}: ${css};`;
  });
  // `color-scheme` makes native form controls & scrollbars match the theme.
  decls.unshift(`  color-scheme: ${theme.mode};`);

  const selector =
    theme.slug === "default" ? `:root,\n[data-theme="default"]` : `[data-theme="${theme.slug}"]`;
  return `${selector} {\n${decls.join("\n")}\n}`;
}
