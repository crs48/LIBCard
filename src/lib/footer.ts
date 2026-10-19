import catalog from "../../.libcard/designs.json";
import { licenseRequiresAttribution, type ThemeMeta } from "./themes";
import { withBase } from "./site";
import { builtinLayouts } from "./design-manifest.mjs";

export interface DesignEntry {
  id: string;
  name: string;
  layout: string;
  theme: string;
  builtin?: boolean;
  credit?: { author: string; authorUrl?: string; license: string };
}

export interface FooterCredit {
  name: string;
  kind: "design" | "layout" | "theme";
  href: string;
  author?: string;
  authorUrl?: string;
}

type FooterConfig = {
  design?: string;
  layout: string;
  footer: { themeCredit: boolean; designCredit: boolean };
};

export const galleryId = (kind: "design" | "theme", id: string) => `${kind}-${id}`;
export const galleryHref = (base: string, kind: "design" | "theme", id: string) =>
  `${withBase(base, `/${kind}s`)}#${encodeURIComponent(galleryId(kind, id))}`;

export const isHomePage = (pathname: string, base: string) =>
  pathname.replace(/\/$/, "") === withBase(base, "/").replace(/\/$/, "");

/** Describe what is rendered, including a visitor's current theme selection. */
export function footerCredits(
  config: FooterConfig,
  theme: ThemeMeta | undefined,
  { base, home, designs = catalog }: { base: string; home: boolean; designs?: DesignEntry[] },
): FooterCredit[] {
  const selected = home ? designs.find((d) => d.id === config.design) : undefined;
  const layout = home ? designs.find((d) => d.layout === config.layout && (d.builtin || d.id === config.layout)) : undefined;
  const required = (entry: DesignEntry | undefined) => !!entry?.credit && licenseRequiresAttribution(entry.credit.license);
  const credit = (entry: DesignEntry, kind: "design" | "layout"): FooterCredit => ({
    name: kind === "layout" && entry.builtin
      ? builtinLayouts[config.layout as keyof typeof builtinLayouts]?.name ?? entry.name
      : entry.name,
    kind,
    href: galleryHref(base, "design", entry.id),
    author: entry.credit?.author,
    authorUrl: entry.credit?.authorUrl,
  });
  const complete = selected && selected.layout === config.layout &&
    (selected.theme === theme?.slug || selected.theme === theme?.designId);
  const showDesign = complete && (config.footer.designCredit || required(selected));
  const showLayout = !showDesign && home && (config.design || config.layout !== "classic") && layout &&
    (config.footer.designCredit || required(layout));
  const composition = showDesign ? [credit(selected, "design")] : showLayout ? [credit(layout, "layout")] : [];
  // An overridden preset can still contribute defaults; keep its required credit.
  const retained = selected && required(selected) && !showDesign && !(showLayout && layout.id === selected.id)
    ? [credit(selected, "design")] : [];
  const showTheme = theme && ((!showDesign && config.footer.themeCredit) || licenseRequiresAttribution(theme.license));
  return [...composition, ...retained, ...(showTheme ? [{
    name: theme.name,
    kind: "theme" as const,
    href: galleryHref(base, "theme", theme.slug),
    author: theme.author,
    authorUrl: theme.authorUrl,
  }] : [])];
}
