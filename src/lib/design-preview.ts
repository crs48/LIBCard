import type { LibcardConfig } from "./config";
import { designs, resolvePresentation } from "./presentation";
import { withBase } from "./site";

export const designPreviewHref = (base: string, id: string) => withBase(base, `/designs/try/${id}/`);

/** A preview changes presentation only; the owner's home config stays intact. */
export function previewConfig(config: LibcardConfig, id: string): LibcardConfig {
  const presentation = resolvePresentation({ design: id, layoutOptions: config.layoutOptions });
  return {
    ...config, ...presentation, design: id,
    theme: typeof config.theme === "object"
      ? { ...config.theme, name: presentation.theme as string, random: false }
      : presentation.theme,
  };
}

export function designChoices(config: Pick<LibcardConfig, "footer">, base: string) {
  return config.footer.designGallery
    ? designs.map((design) => ({ id: design.id, name: design.name, href: designPreviewHref(base, design.id) }))
    : [];
}
