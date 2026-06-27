// LibCard theme scaffolder — `pnpm run new-theme`.
//
// An interactive prompt (Node builtins + the `yaml` package) that writes a new,
// already-valid theme to themes/<slug>.yaml. It starts from a built-in palette
// (so every color is filled in) and lets you tweak the essentials — meaning the
// file it produces passes validation and contrast checks unedited. Then: open a
// PR. See themes/README.md for the full contribution guide.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { execSync } from "node:child_process";
import { stdin, stdout } from "node:process";
import { stringify } from "yaml";
import { loadThemes, themeSchema, FONT_STACKS } from "../src/lib/theme-schema.mjs";

const root = new URL("../", import.meta.url);
const themesDir = fileURLToPath(new URL("themes", root));

// Interactive when attached to a terminal; otherwise read the whole piped input
// up front and answer prompts from it (so scripted / no-input runs are
// deterministic and still produce a valid file).
const interactive = Boolean(stdin.isTTY);
let rl = null;
let queued = [];

async function loadInput() {
  if (interactive) {
    rl = createInterface({ input: stdin, output: stdout });
    return;
  }
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  queued = Buffer.concat(chunks).toString("utf-8").split(/\r?\n/);
}

async function ask(question, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  if (interactive) {
    let answer = "";
    try {
      answer = (await rl.question(`${question}${suffix}: `)).trim();
    } catch {
      answer = "";
    }
    return answer || fallback;
  }
  const answer = (queued.length ? queued.shift() : "").trim();
  stdout.write(`${question}${suffix}: ${answer}\n`);
  return answer || fallback;
}

/** Best-effort author name from git, so a no-input run still produces a valid file. */
function gitUser() {
  try {
    return execSync("git config user.name", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  await loadInput();
  const existing = loadThemes(themesDir);
  const bases = Object.fromEntries(existing.map((t) => [t.slug, t.tokens]));

  console.log("\n  New LibCard theme — press Enter to accept the [default].\n");

  const name = await ask("Theme name", "My Theme");
  let slug = slugify(await ask("Slug (filename)", slugify(name)));
  while (existing.some((t) => t.slug === slug) || existsSync(`${themesDir}/${slug}.yaml`)) {
    console.log(`  ! "${slug}" already exists — pick another.`);
    slug = slugify(await ask("Slug (filename)"));
  }

  const author = await ask("Your name (you'll be credited)", gitUser() || "Anonymous");
  const authorUrl = await ask("Your URL (optional)", "");
  const license = await ask("License (SPDX id)", "CC-BY-4.0");
  const mode = (await ask("Mode (light | dark)", "dark")).toLowerCase() === "light" ? "light" : "dark";
  const fonts = Object.keys(FONT_STACKS).join(" | ");
  const font = await ask(`Font (${fonts})`, "sans");

  // Start from a same-mode built-in so all seven colors are pre-filled.
  const baseSlug = mode === "light" ? (bases.default ? "default" : Object.keys(bases)[0]) : "midnight";
  const base = bases[baseSlug] ?? bases[Object.keys(bases)[0]];

  console.log(`\n  Colors (hex). Enter to keep ${baseSlug}'s value.\n`);
  const tokens = {
    bg: await ask("  bg (page background)", base.bg),
    surface: await ask("  surface (cards & buttons)", base.surface),
    fg: await ask("  fg (text)", base.fg),
    muted: await ask("  muted (secondary text)", base.muted),
    accent: await ask("  accent (links & buttons)", base.accent),
    accentContrast: await ask("  accentContrast (text on accent)", base.accentContrast),
    border: await ask("  border (hairlines)", base.border),
    font: FONT_STACKS[font] ? font : "sans",
    radius: await ask("  radius (e.g. 1rem, 8px)", base.radius),
  };

  const theme = {
    name,
    author,
    ...(authorUrl ? { authorUrl } : {}),
    license,
    mode,
    tags: [mode],
    tokens,
  };

  // Validate before writing so we never emit a broken theme.
  themeSchema.parse(theme);

  const header = "# yaml-language-server: $schema=./theme.schema.json\n";
  mkdirSync(themesDir, { recursive: true });
  writeFileSync(`${themesDir}/${slug}.yaml`, header + stringify(theme));

  console.log(`\n  ✓ Wrote themes/${slug}.yaml`);
  console.log("  Preview it:   pnpm run gen:themes && pnpm dev   (then set theme: " + slug + ")");
  console.log("  Then open a pull request to add it to the gallery. Thank you! ✨\n");
}

main()
  .catch((error) => {
    console.error("\n" + (error?.message ?? error) + "\n");
    process.exitCode = 1;
  })
  .finally(() => rl?.close());
