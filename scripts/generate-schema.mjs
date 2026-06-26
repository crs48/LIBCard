// Generates libcard.schema.json from the Zod schema (the single source of
// truth). Runs automatically before every build (`prebuild`) and can be run
// directly with `pnpm generate:schema`. The committed JSON Schema is what gives
// editors (and AI agents) autocomplete + validation for libcard.config.yaml,
// via the `# yaml-language-server: $schema=` directive at the top of that file.
import { writeFileSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { libcardSchema } from "../src/lib/schema.mjs";

const jsonSchema = zodToJsonSchema(libcardSchema, {
  name: "LibcardConfig",
  $refStrategy: "none",
});

const out = new URL("../libcard.schema.json", import.meta.url);
writeFileSync(out, JSON.stringify(jsonSchema, null, 2) + "\n");
console.log("✓ Wrote libcard.schema.json");
