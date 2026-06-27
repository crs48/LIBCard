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

/**
 * Repeating CSS-gradient patterns. Each maps to a vetted recipe in PATTERN_RECIPES
 * below — themes pick one by NAME, they never write the CSS. (Catalog from
 * exploration 0007; "more interesting than a grid", with `grid` still on offer.)
 */
export const PATTERN_KINDS = ["scales", "dots", "grid", "stripes", "checker", "zigzag"];

/**
 * The CSS each pattern emits (scoped to `[data-theme] .lc-pattern` by themeToCss).
 * Ink + tile size come from the theme's `--lc-ink` / `--lc-pat-size` vars, so the
 * project owns every byte of the gradient — a theme only references it by name.
 */
export const PATTERN_RECIPES = {
  scales:
    "--s: var(--lc-pat-size, 44px);\n" +
    "  background:\n" +
    "    radial-gradient(circle at 50% 0, transparent 70%, var(--lc-ink) 71%),\n" +
    "    radial-gradient(circle at 50% 100%, var(--lc-ink) 70%, transparent 71%);\n" +
    "  background-size: var(--s) var(--s);\n" +
    "  background-position: 0 0, calc(var(--s) / 2) calc(var(--s) / 2);",
  dots:
    "--s: var(--lc-pat-size, 22px);\n" +
    "  background-image: radial-gradient(var(--lc-ink) 1.6px, transparent 1.7px);\n" +
    "  background-size: var(--s) var(--s);",
  grid:
    "--s: var(--lc-pat-size, 32px);\n" +
    "  background-image:\n" +
    "    linear-gradient(var(--lc-ink) 1px, transparent 1px),\n" +
    "    linear-gradient(90deg, var(--lc-ink) 1px, transparent 1px);\n" +
    "  background-size: var(--s) var(--s);",
  stripes:
    "--s: var(--lc-pat-size, 18px);\n" +
    "  background: repeating-linear-gradient(45deg, var(--lc-ink) 0 calc(var(--s) / 2), transparent 0 var(--s));",
  checker:
    "--s: var(--lc-pat-size, 36px);\n" +
    "  background: repeating-conic-gradient(var(--lc-ink) 0% 25%, transparent 0% 50%) 50% / var(--s) var(--s);",
  zigzag:
    "--s: var(--lc-pat-size, 24px);\n" +
    "  background:\n" +
    "    linear-gradient(135deg, var(--lc-ink) 25%, transparent 25%) 0 0,\n" +
    "    linear-gradient(225deg, var(--lc-ink) 25%, transparent 25%) 0 0,\n" +
    "    linear-gradient(315deg, var(--lc-ink) 25%, transparent 25%) calc(var(--s) / 2) calc(var(--s) / 2),\n" +
    "    linear-gradient(45deg, var(--lc-ink) 25%, transparent 25%) calc(var(--s) / 2) calc(var(--s) / 2);\n" +
    "  background-size: var(--s) var(--s);",
};

/** Page background: a flat color (default), or a soft (optionally blurred) pastel mesh. */
const backgroundSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("solid") }).strict(),
    z
      .object({
        kind: z.literal("pastel-mesh"),
        stops: z.array(color).min(2).max(4), // blob colors
        blur: z.number().min(0).max(120).default(0), // px of softening on the blobs
        animate: z.boolean().default(false), // slow drift (auto-off under reduced motion)
      })
      .strict(),
  ])
  .optional();

/** An optional repeating-gradient texture layer, under the card. */
const patternSchema = z
  .object({
    kind: z.enum(PATTERN_KINDS),
    intensity: z.number().min(0).max(0.15).default(0.05), // ink alpha — the subtlety dial
    size: z.string().regex(LENGTH).optional(),
    maskFade: z.boolean().default(true), // radial edge vignette
  })
  .strict()
  .optional();

/** Button treatment. `glass` = frosted translucency (needs a real background behind it). */
const buttonsSchema = z
  .object({
    fill: z.enum(["solid", "glass"]).default("solid"),
    // Readability floor: a translucent button over a gradient has no fixed
    // contrast, so the fill doubles as the scrim. Below 0.15 it's unreadable.
    glassFillOpacity: z.number().min(0.15).max(0.6).default(0.18),
  })
  .strict()
  .default({ fill: "solid", glassFillOpacity: 0.18 });

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
    // Optional expressive layers (exploration 0007). All default to today's flat
    // look, so existing themes are unchanged.
    background: backgroundSchema,
    pattern: patternSchema,
    buttons: buttonsSchema,
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
    // Expressive layers — the Layout reads these to decide which effect markup
    // (mesh blob stage, pattern layer) to mount for the active theme set.
    background: theme.background ?? null,
    pattern: theme.pattern ?? null,
    buttons: theme.buttons,
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

  // --- Expressive layers (all opt-in; absent → today's flat look) ---
  // Pastel-mesh background → blob color vars + blur + drift toggle (the shared
  // .lc-bg-stage CSS reads these; unset means transparent → invisible).
  const bg = theme.background;
  if (bg?.kind === "pastel-mesh") {
    for (let i = 0; i < 4; i++) decls.push(`  --lc-mesh-${i + 1}: ${bg.stops[i % bg.stops.length]};`);
    decls.push(`  --lc-bg-blur: ${bg.blur}px;`);
    decls.push(`  --lc-bg-anim: ${bg.animate ? "running" : "paused"};`);
  }

  // Glass surfaces → translucent fill + backdrop blur (the frosted edge comes
  // from the theme's own light border token; see effects.css).
  if (theme.buttons?.fill === "glass") {
    decls.push(`  --lc-glass-pct: ${Math.round(theme.buttons.glassFillOpacity * 100)}%;`);
    decls.push(`  --lc-glass-filter: blur(12px) saturate(150%);`);
  }

  // Pattern → ink (fg at low alpha) + tile size; the gradient recipe is emitted
  // as a scoped block below.
  if (theme.pattern) {
    const pct = Number((theme.pattern.intensity * 100).toFixed(2));
    decls.push(`  --lc-ink: color-mix(in oklab, var(--lc-fg) ${pct}%, transparent);`);
    if (theme.pattern.size) decls.push(`  --lc-pat-size: ${theme.pattern.size};`);
  }

  const selector =
    theme.slug === "default" ? `:root,\n[data-theme="default"]` : `[data-theme="${theme.slug}"]`;
  let css = `${selector} {\n${decls.join("\n")}\n}`;

  if (theme.pattern && PATTERN_RECIPES[theme.pattern.kind]) {
    css += `\n\n[data-theme="${theme.slug}"] .lc-pattern {\n  ${PATTERN_RECIPES[theme.pattern.kind]}\n}`;
  }
  return css;
}
