// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

// Single source of truth: the user edits ONE file, libcard.config.yaml.
// We read `site.url` / `site.base` from it here so the deploy URL and the
// asset base path stay in sync with everything else on the page.
// (`LIBCARD_CONFIG=other.yaml` builds a different file, e.g. a test fixture;
// src/content.config.ts reads the same variable.)
const configPath = process.env.LIBCARD_CONFIG || "libcard.config.yaml";
const cfg = parse(readFileSync(new URL(`./${configPath}`, import.meta.url), "utf-8"));

const site = cfg?.site?.url ?? "https://example.github.io";
const base = cfg?.site?.base ?? "/";

// https://astro.build/config
export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "ignore",
  vite: {
    plugins: [tailwindcss()],
  },
});
