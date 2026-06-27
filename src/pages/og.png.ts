import type { APIRoute } from "astro";
import sharp from "sharp";
import { getConfig, getActiveTheme } from "../lib/config";
import { getThemeMeta } from "../lib/themes";

// Build-time Open Graph image (1200×630 PNG) so shared links render a rich
// preview. We compose an SVG from the config and rasterize it with sharp (PNG,
// because social scrapers reject SVG). Skipped automatically if the user sets a
// custom `seo.ogImage`. Colors come from the active theme's own tokens, so the
// preview always matches the live card (including community themes).
export const prerender = true;

const WIDTH = 1200;
const HEIGHT = 630;

const FALLBACK = {
  bg: "#0b1120",
  surface: "#131c31",
  fg: "#e8edf7",
  accent: "#6366f1",
  muted: "#94a3b8",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value;
}

export const GET: APIRoute = async () => {
  const cfg = await getConfig();
  const active = await getActiveTheme();
  const t = getThemeMeta(active.name)?.tokens;
  const c = t
    ? { bg: t.bg, bg2: t.surface, fg: t.fg, accent: t.accent, muted: t.muted }
    : { bg: FALLBACK.bg, bg2: FALLBACK.surface, fg: FALLBACK.fg, accent: FALLBACK.accent, muted: FALLBACK.muted };

  const name = escapeXml(truncate(cfg.profile.name, 40));
  const tagline = escapeXml(truncate(cfg.seo?.description ?? cfg.profile.tagline ?? "", 70));
  const handle = escapeXml(truncate(cfg.contact.website ?? cfg.site.url, 60));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c.bg}"/>
      <stop offset="1" stop-color="${c.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${WIDTH}" height="14" fill="${c.accent}"/>
  <g font-family="Helvetica, Arial, sans-serif">
    <text x="90" y="250" font-size="84" font-weight="700" fill="${c.fg}">${name}</text>
    <text x="90" y="330" font-size="40" font-weight="400" fill="${c.muted}">${tagline}</text>
    <text x="90" y="560" font-size="30" font-weight="600" fill="${c.accent}">${handle}</text>
    <text x="${WIDTH - 90}" y="560" font-size="28" font-weight="600" fill="${c.muted}" text-anchor="end">LibCard</text>
  </g>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
