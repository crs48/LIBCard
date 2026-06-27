// Helpers for the "★ Star" sub-button on GitHub repo links (see LinkButton.astro).
//
// A genuine one-click star isn't possible from another site — starring is an
// authenticated, CSRF-protected action only GitHub's own pages can issue. So the
// pill just opens the repo. The optional count is fetched at build time and baked
// into the static page (zero runtime JS, zero third-party request), refreshed
// whenever the site rebuilds.

const REPO_RE = /^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+?)(?:\.git)?\/?$/i;

// First path segments under github.com that are reserved routes, not user/org
// names — so e.g. github.com/orgs/foo or github.com/features isn't a "repo".
const RESERVED_OWNERS = new Set([
  "orgs",
  "sponsors",
  "marketplace",
  "features",
  "topics",
  "collections",
  "trending",
  "about",
  "pricing",
  "settings",
  "notifications",
  "explore",
  "apps",
  "login",
  "join",
]);

export interface Repo {
  owner: string;
  repo: string;
}

/** Parse `owner/repo` from a GitHub repo URL, or null for profiles/deep paths. */
export function parseRepo(url: string): Repo | null {
  const m = url.match(REPO_RE);
  if (!m) return null;
  const [, owner, repo] = m;
  if (RESERVED_OWNERS.has(owner.toLowerCase())) return null;
  return { owner, repo };
}

/** 1234 → "1.2k", 12345 → "12k" — compact, locale-free. */
export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

/** shields.io badge URL for a repo's star count (used by the `badge` mode). */
export function shieldsStarsUrl({ owner, repo }: Repo): string {
  return `https://img.shields.io/github/stars/${owner}/${repo}?style=flat&label=%E2%98%85`;
}

// One fetch per repo per build: many cards won't repeat a repo, but the cache
// keeps us correct (and under the rate limit) if they do.
const cache = new Map<string, Promise<number | null>>();

/**
 * Build-time star count for a repo. Fails soft — returns null on any error
 * (offline dev build, rate limit, renamed/404 repo) so the build never breaks.
 * Pass GITHUB_TOKEN in CI to lift the API limit from 60 → 5,000 req/hr.
 */
export function fetchStarCount({ owner, repo }: Repo): Promise<number | null> {
  const key = `${owner}/${repo}`.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const token = process.env.GITHUB_TOKEN;
  const pending = fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "libcard",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as { stargazers_count?: unknown };
      return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
    })
    .catch(() => null);

  cache.set(key, pending);
  return pending;
}
