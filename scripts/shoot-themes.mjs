// Per-theme preview images — `pnpm run shoot-themes [slug...]`.
//
// Renders each theme as a small sample card and rasterizes it to a PNG in
// themes/.previews/. Used by theme CI to attach a visual preview to a theme PR,
// so reviewers can see a submission at a glance.
//
// We compose an SVG from the theme's own tokens and rasterize with sharp (already
// a dependency) instead of driving a headless browser — no Playwright, no browser
// download, fully deterministic, and it mirrors how src/pages/og.png.ts works.
// (The /themes gallery renders LIVE previews and does not depend on these files.)
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadThemes } from "../src/lib/theme-schema.mjs";

const root = new URL("../", import.meta.url);
const themesDir = fileURLToPath(new URL("themes", root));
const outDir = fileURLToPath(new URL("themes/.previews", root));

const W = 640;
const H = 420;

// A fixed sample profile so every theme is shown with identical content.
const SAMPLE = {
  name: "Ada Lovelace",
  tagline: "Mathematician · first programmer",
  links: ["My website", "Book a call"],
};

// Map the font enum to an SVG-safe generic family.
const SVG_FONT = { sans: "Helvetica, Arial, sans-serif", serif: "Georgia, serif", mono: "monospace", rounded: "Helvetica, Arial, sans-serif" };

function px(len) {
  const m = String(len).match(/^([\d.]+)(px|rem|em)$/);
  if (!m) return 12;
  return m[2] === "px" ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function svgFor(theme) {
  const t = theme.tokens;
  const r = Math.min(px(t.radius), 28);
  const font = SVG_FONT[t.font] ?? SVG_FONT.sans;
  const cardX = 40;
  const cardW = W - 80;
  const button = (y, label, primary) => `
    <rect x="${cardX + 24}" y="${y}" width="${cardW - 48}" height="48" rx="${r}"
      fill="${primary ? t.accent : t.surface}" stroke="${t.border}" stroke-width="1"/>
    <text x="${W / 2}" y="${y + 30}" font-size="18" font-family="${font}" text-anchor="middle"
      fill="${primary ? t.accentContrast : t.fg}">${esc(label)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <rect x="${cardX}" y="32" width="${cardW}" height="${H - 64}" rx="${Math.min(r + 6, 32)}"
    fill="${t.surface}" stroke="${t.border}" stroke-width="1"/>
  <circle cx="${W / 2}" cy="92" r="30" fill="${t.bg}" stroke="${t.border}" stroke-width="2"/>
  <text x="${W / 2}" y="150" font-size="24" font-weight="700" font-family="${font}" text-anchor="middle" fill="${t.fg}">${esc(SAMPLE.name)}</text>
  <text x="${W / 2}" y="178" font-size="15" font-family="${font}" text-anchor="middle" fill="${t.muted}">${esc(SAMPLE.tagline)}</text>
  ${button(210, SAMPLE.links[0], false)}
  ${button(270, SAMPLE.links[1], false)}
  <rect x="${cardX + 24}" y="330" width="${cardW - 48}" height="44" rx="${r}" fill="${t.accent}"/>
  <text x="${W / 2}" y="358" font-size="16" font-weight="600" font-family="${font}" text-anchor="middle" fill="${t.accentContrast}">Save contact</text>
  <text x="${W - 40}" y="${H - 14}" font-size="12" font-family="${font}" text-anchor="end" fill="${t.muted}">${esc(theme.name)}</text>
</svg>`;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const themes = loadThemes(themesDir).filter((t) => !t.isExample && (only.length === 0 || only.includes(t.slug)));

mkdirSync(outDir, { recursive: true });
for (const theme of themes) {
  const png = await sharp(Buffer.from(svgFor(theme))).png().toBuffer();
  writeFileSync(`${outDir}/${theme.slug}.png`, png);
  console.log(`✓ themes/.previews/${theme.slug}.png`);
}
console.log(`\nRendered ${themes.length} preview(s).`);
