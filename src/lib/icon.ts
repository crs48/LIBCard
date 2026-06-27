import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

/**
 * App-icon + favicon rasterizer. `public/favicon.svg` is the single source of
 * truth for the LibCard mark; the routes under `src/pages/*.png.ts` call this to
 * emit the PNGs that browsers and home screens need (SVG favicons cover modern
 * browsers, but iOS home-screen and PWA/Android icons must be PNG). Read from
 * the project root at build time — cwd is the repo root under both `astro dev`
 * and `astro build`.
 */
const SVG = readFileSync(resolve("public/favicon.svg"));

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

export interface IconOptions {
  /** Output edge length in pixels (square). */
  size: number;
  /** Fraction of each edge reserved as empty margin around the mark (0–0.5). */
  padding?: number;
  /** Opaque background, e.g. "#ffffff". Omit for a transparent icon. */
  background?: string;
}

/**
 * Render the mark to a square PNG. With `background` set the result is fully
 * opaque (required for iOS/Android, which render transparency as black) and the
 * mark is centered with `padding` breathing room; without it the icon keeps the
 * SVG's transparency (used for the small favicon fallback).
 */
export async function renderIcon({ size, padding = 0, background }: IconOptions): Promise<Buffer> {
  const inner = Math.round(size * (1 - 2 * padding));
  // Rasterize the SVG above the target resolution so the downscale stays crisp.
  const mark = await sharp(SVG, { density: Math.ceil(size * 1.5) })
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();

  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: background ?? TRANSPARENT },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();

  return png;
}

/** Standard 1-year immutable cache headers for the generated icon assets. */
export const ICON_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=31536000, immutable",
} as const;
