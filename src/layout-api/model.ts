import { getConfig, getFeedme, type LibcardConfig, type LibcardLink, type LibcardBlock } from "../lib/config";
import { normalizePage, type LinkSection } from "../lib/page";
import { resolveLink } from "../lib/link-model";
import { withBase, absoluteUrl } from "../lib/site";
import { checkoutUrl, creatorTarget, formatSignal, tipActionFor, socialDisplayName } from "../lib/feedme";

export type ResolvedLink = LibcardLink & { presentation: Awaited<ReturnType<typeof resolveLink>> };
export type ResolvedSection = (Omit<LinkSection, "links"> & { links: ResolvedLink[] }) | LibcardBlock;
export type ProfileAction = { label: string; href: string; icon: string; download?: string };
export function profileActions(config: LibcardConfig, base: string): ProfileAction[] {
  return [...new Set(config.profileActions)].flatMap((kind): ProfileAction[] => {
    if (kind === "email") return config.contact.email ? [{ label: "Say hello", href: `mailto:${config.contact.email}`, icon: "mail" }] : [];
    if (kind === "save-contact") return [{ label: "Save contact", href: withBase(base, "/contact.vcf"), icon: "contact", download: "contact.vcf" }];
    return [{ label: "Show card", href: withBase(base, "/card"), icon: "qr-code" }];
  });
}

/** API 1: resolved content, independent of the selected visual layout. */
export async function createPageModel(config: LibcardConfig, base: string, site?: URL) {
  const feedme = await getFeedme();
  const mediaUrl = (src: string) => /^https?:\/\//i.test(src) ? src : withBase(base, src);
  const links: ResolvedLink[] = await Promise.all(config.links.map(async (link) => ({
    ...link,
    iconImage: link.iconImage ? mediaUrl(link.iconImage) : undefined,
    image: link.image ? { ...link.image, src: mediaUrl(link.image.src) } : undefined,
    presentation: await resolveLink(link, config.statuses, feedme),
  })));
  const normalized = normalizePage({ ...config, links });
  const creator = creatorTarget(feedme);
  const model = {
    apiVersion: 1 as const,
    profile: { ...config.profile, avatar: mediaUrl(config.profile.avatar || "/avatar.svg"),
      give: feedme && config.feedme?.give !== false ? { href: checkoutUrl(feedme.origin), signal: creator ? formatSignal(creator) : null } : null },
    actions: profileActions(config, base),
    links,
    sections: normalized.sections as ResolvedSection[],
    legacy: normalized.legacy,
    socials: config.socials.map((social) => ({ ...social, name: socialDisplayName(social), tip: tipActionFor(feedme, "social", social, socialDisplayName(social)) })),
    card: { url: absoluteUrl(site, base, "/"), href: withBase(base, "/card"), contactHref: withBase(base, "/contact.vcf"), enabled: config.cardMode.enabled },
    site: { url: site?.href ?? config.site.url, base },
    firstRun: config.meta.default,
  };
  return freeze(model);
}

// Freeze copies so one layout cannot accidentally change the core utility data.
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
export type PageModelV1 = Awaited<ReturnType<typeof createPageModel>>;
export interface LayoutProps { page: PageModelV1; options: Readonly<Record<string, unknown>>; }
export async function getPageModel() {
  const config = await getConfig();
  return createPageModel(config, import.meta.env.BASE_URL, new URL(config.site.url));
}
