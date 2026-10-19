import type { LibcardConfig, LibcardLink, LibcardBlock } from "./config";

export type LinkSection = {
  type: "links";
  id: string;
  title?: string;
  purpose: "work" | "services" | "writing" | "experiments" | "general";
  collapsed: boolean;
  links: LibcardLink[];
};
export type PageSection = LinkSection | LibcardBlock;

/** Pure normalization: order and membership belong to the owner, not a layout. */
export function normalizePage(config: LibcardConfig) {
  const byId = new Map(config.links.map((link) => [link.id, link]));
  const sections: PageSection[] = config.sections
    ? config.sections.flatMap((section): PageSection[] => section.type === "blocks" ? config.blocks : section.type === "links"
      ? [{ ...section, links: section.items.map((id) => {
        const link = byId.get(id);
        if (!link) throw new Error(`Unknown link "${id}". Validate config before normalization.`);
        return link;
      }) }]
      : [section])
    : [
      ...(config.links.length ? [{ type: "links" as const, id: "links", purpose: "general" as const, collapsed: false, links: config.links }] : []),
      ...config.blocks,
    ];
  return { profile: config.profile, sections, legacy: !config.sections };
}
