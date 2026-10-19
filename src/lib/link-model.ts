import type { LibcardConfig, LibcardLink } from "./config";
import { parseRepo, formatStars, shieldsStarsUrl, fetchStarCount } from "./github";
import { resolveStatus } from "./status";
import { tipActionFor, type FeedmeState } from "./feedme";

/** Shared metadata/actions for every link treatment. Enrichment stays build-time. */
export async function resolveLink(link: LibcardLink, statuses: LibcardConfig["statuses"], feedme: FeedmeState | null) {
  const external = /^https?:\/\//i.test(link.url);
  const companion = link.github ? parseRepo(link.github) : null;
  const repo = companion ?? (link.star || link.stars !== "off" ? parseRepo(link.url) : null);
  const n = repo && link.stars === "build" ? await fetchStarCount(repo) : null;
  const count = n === null ? null : formatStars(n);
  const tip = tipActionFor(feedme, "link", link, link.label);
  return {
    external,
    rel: external ? "noopener noreferrer" : undefined,
    target: external ? "_blank" : undefined,
    status: resolveStatus(link.status, statuses),
    companion, repo, count,
    pillHref: companion ? link.github! : link.url,
    badgeSrc: repo && link.stars === "badge" ? shieldsStarsUrl(repo) : null,
    pillLabel: repo ? companion
      ? `${repo.owner}/${repo.repo} on GitHub${count ? ` (${count} ${count === "1" ? "star" : "stars"})` : ""}`
      : `Star ${repo.owner}/${repo.repo} on GitHub` : undefined,
    tip,
    tipTitle: tip ? [tip.blurb, tip.signal].filter(Boolean).join(" · ") || "Tip via Feedme" : undefined,
  };
}
