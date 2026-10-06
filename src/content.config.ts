import { defineCollection } from "astro:content";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { libcardSchema } from "./lib/schema.mjs";

// LibCard's entire content is one config object. We load it with a tiny inline
// loader (the built-in file() loader is built for files holding *many* entries,
// not a single object) and validate it against the shared Zod schema. A bad
// value here — malformed email, unknown theme, typo'd field — fails the build
// with a readable error instead of shipping a broken card.
//
// `LIBCARD_CONFIG=path/to/other.yaml pnpm build` builds a different config file
// (relative to the repo root) — used to build test fixtures without touching
// the owner's libcard.config.yaml. astro.config.mjs honors the same variable.
const configPath = process.env.LIBCARD_CONFIG || "libcard.config.yaml";

const libcard = defineCollection({
  loader: () => {
    const raw = readFileSync(new URL(`../${configPath}`, import.meta.url), "utf-8");
    const data = parse(raw);
    return [{ id: "libcard", ...data }];
  },
  schema: libcardSchema,
});

export const collections = { libcard };
