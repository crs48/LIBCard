import type { z } from "zod";
import type { libcardSchema } from "./schema.mjs";

type Config = z.infer<typeof libcardSchema>;
export const designs = {
  classic: { layout: "classic", theme: "default", density: "comfortable", mediaTone: "original" },
  "personal-home": { layout: "editorial", theme: "monochrome", density: "compact", mediaTone: "grayscale" },
} as const;

/** Defaults are resolved after input validation, preserving explicit overrides. */
export function resolvePresentation(config: Pick<Config, "design" | "layout" | "theme" | "layoutOptions">) {
  const preset = designs[config.design ?? "classic"];
  const layout = config.layout ?? preset.layout;
  return {
    layout,
    theme: config.theme ?? preset.theme,
    options: {
      density: layout === "editorial" ? config.layoutOptions?.editorial?.density ?? preset.density : "comfortable",
      mediaTone: layout === "editorial" ? config.layoutOptions?.editorial?.mediaTone ?? preset.mediaTone : "original",
    },
  };
}
