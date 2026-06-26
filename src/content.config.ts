import { defineCollection } from "astro:content";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { libcardSchema } from "./lib/schema.mjs";

// LibCard's entire content is one config object. We load it with a tiny inline
// loader (the built-in file() loader is built for files holding *many* entries,
// not a single object) and validate it against the shared Zod schema. A bad
// value here — malformed email, unknown theme, typo'd field — fails the build
// with a readable error instead of shipping a broken card.
const libcard = defineCollection({
  loader: () => {
    const raw = readFileSync(new URL("../libcard.config.yaml", import.meta.url), "utf-8");
    const data = parse(raw);
    return [{ id: "libcard", ...data }];
  },
  schema: libcardSchema,
});

export const collections = { libcard };
