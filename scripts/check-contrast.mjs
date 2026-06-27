// WCAG AA contrast gate for themes — `pnpm run check-contrast`.
//
// Themes are about looks, but they still have to be readable. This computes the
// WCAG 2.1 contrast ratio for each theme's key text/background pairs and FAILS
// (exit 1) if an enforced pair drops below AA (4.5:1 for normal text). The
// contrast math is inlined (no dependency) — relative luminance per the spec.
//
// Enforced (block the PR): fg/bg, fg/surface, accentContrast/accent.
// Advisory (warn only):    muted/bg, muted/surface — muted text is intentionally
//                          lower-contrast, so we surface it without blocking.
import { fileURLToPath } from "node:url";
import { loadThemes } from "../src/lib/theme-schema.mjs";

const AA = 4.5;
const themesDir = fileURLToPath(new URL("../themes", import.meta.url));

function channel(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgb(hex) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
const toHex = (n) => Math.round(n).toString(16).padStart(2, "0");
/** `fg` painted at opacity `a` over `bg` — the actual color behind glass text. */
function over(fgHex, bgHex, a) {
  const f = rgb(fgHex);
  const b = rgb(bgHex);
  return "#" + [0, 1, 2].map((i) => toHex(f[i] * a + b[i] * (1 - a))).join("");
}

const ENFORCED = [
  ["fg", "bg", "text on the page"],
  ["fg", "surface", "text on cards"],
  ["accentContrast", "accent", "text on buttons"],
];
const ADVISORY = [
  ["muted", "bg", "muted text on the page"],
  ["muted", "surface", "muted text on cards"],
];

// Optionally limit to specific slugs (CI may pass only the changed themes).
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const themes = loadThemes(themesDir).filter((t) => !t.isExample && (only.length === 0 || only.includes(t.slug)));

let failures = 0;
for (const t of themes) {
  const lines = [];
  let themeFailed = false;
  for (const [fg, bg, what] of ENFORCED) {
    const r = ratio(t.tokens[fg], t.tokens[bg]);
    const ok = r >= AA;
    if (!ok) {
      themeFailed = true;
      failures++;
    }
    lines.push(`    ${ok ? "✓" : "✗"} ${fg}/${bg} ${r.toFixed(2)}:1  (${what})`);
  }
  for (const [fg, bg, what] of ADVISORY) {
    const r = ratio(t.tokens[fg], t.tokens[bg]);
    if (r < AA) lines.push(`    ⚠ ${fg}/${bg} ${r.toFixed(2)}:1  (${what}; advisory)`);
  }

  // Glass buttons have no fixed contrast — the label sits over whatever the
  // background paints through the translucent fill. Test the WORST-CASE point:
  // the fg against the fill composited over each mesh stop (and the base bg).
  if (t.buttons?.fill === "glass" && t.background?.kind === "pastel-mesh") {
    const a = t.buttons.glassFillOpacity;
    const behind = [t.tokens.bg, ...t.background.stops];
    for (const stop of behind) {
      const composite = over(t.tokens.surface, stop, a); // surface fill over the stop
      const r = ratio(t.tokens.fg, composite);
      const ok = r >= AA;
      if (!ok) {
        themeFailed = true;
        failures++;
      }
      lines.push(`    ${ok ? "✓" : "✗"} glass label over ${stop} ${r.toFixed(2)}:1  (worst-case)`);
    }
    // The frosted accent CTA shows accent-colored text on the glass surface fill
    // (see --lc-cta-* in theme-schema.mjs). Verify the accent text over that fill
    // composited on the lightest backdrop (worst case for the accent's contrast).
    const lightest = behind.reduce((a1, b1) => (luminance(b1) > luminance(a1) ? b1 : a1));
    const ctaFill = over(t.tokens.surface, lightest, a); // same fill as other glass panels
    const cr = ratio(t.tokens.accent, ctaFill);
    const cok = cr >= AA;
    if (!cok) {
      themeFailed = true;
      failures++;
    }
    lines.push(`    ${cok ? "✓" : "✗"} frosted CTA accent text ${cr.toFixed(2)}:1  (worst-case)`);
  }

  console.log(`${themeFailed ? "✗" : "✓"} ${t.slug}`);
  console.log(lines.join("\n"));
}

if (failures > 0) {
  console.error(`\n✗ ${failures} enforced pair(s) below WCAG AA (${AA}:1). Adjust the theme's colors.`);
  process.exit(1);
}
console.log(`\n✓ All ${themes.length} theme(s) meet WCAG AA on the enforced pairs.`);
