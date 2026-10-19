import type { z } from "zod";
import type { libcardSchema } from "./schema.mjs";
import catalog from "../../.libcard/designs.json";
import { resolveDesign } from "./design-manifest.mjs";

type Config = z.infer<typeof libcardSchema>;
export const designs = catalog;

/** Defaults are resolved after input validation, preserving explicit overrides. */
export function resolvePresentation(config: Pick<Config, "design" | "layout" | "theme" | "layoutOptions">) {
  return resolveDesign(config, catalog) as { layout: string; theme: NonNullable<Config["theme"]>; options: Record<string, unknown> };
}
