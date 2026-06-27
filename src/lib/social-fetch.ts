/**
 * Build-time fetchers for Tier-4 embeds (tweets, RSS feeds, GitHub stats, and a
 * generic oEmbed fallback). They run during `astro build`, so the rendered page
 * ships ZERO runtime JS and contacts no third party when a visitor loads it —
 * the content is baked into static HTML and refreshed on the next rebuild (a
 * scheduled GitHub Actions `cron`).
 *
 * Every fetcher is FAIL-SOFT: on any network/parse error it returns null/[] and
 * the calling component renders a graceful fallback (a plain link). A flaky
 * network must never fail the deploy.
 */

const TIMEOUT_MS = 8000;
const UA = "LibCard (+https://github.com/crs48/LIBCard)";

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, ...headers } });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = await res.text();
    return body.trim() ? body : null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  const body = await fetchText(url, { Accept: "application/json", ...headers });
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

// --- Tweets / X ------------------------------------------------------------

export interface TweetData {
  text: string;
  name: string;
  username: string;
  date?: string;
  url: string;
}

/** The numeric status id from any twitter.com / x.com status URL. */
export function tweetIdFromUrl(url: string): string | null {
  const m = url.match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/);
  return m ? m[1] : null;
}

/** The token the public syndication endpoint expects (no API key/auth). */
export function tweetToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export async function fetchTweet(url: string): Promise<TweetData | null> {
  const id = tweetIdFromUrl(url);
  if (!id) return null;
  const endpoint = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${tweetToken(id)}&lang=en`;
  const data = await fetchJson<any>(endpoint);
  if (!data || !data.text) return null;
  return {
    text: String(data.text),
    name: String(data.user?.name ?? ""),
    username: String(data.user?.screen_name ?? ""),
    date: data.created_at ? String(data.created_at) : undefined,
    url,
  };
}

// --- RSS / Atom feeds ------------------------------------------------------

export interface FeedItem {
  title: string;
  link: string;
  date?: string;
}

function firstTag(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return undefined;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/** Parse RSS 2.0 `<item>` and Atom `<entry>` with a tiny regex parser (no dep). */
export async function fetchFeed(url: string, limit = 5): Promise<FeedItem[]> {
  const xml = await fetchText(url, { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
  if (!xml) return [];
  const items: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const title = firstTag(block, "title");
    // RSS: <link>url</link>. Atom: <link href="url" />.
    let link = firstTag(block, "link");
    if (!link) {
      const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = href ? href[1] : undefined;
    }
    const date = firstTag(block, "pubDate") ?? firstTag(block, "updated") ?? firstTag(block, "published");
    if (title && link) items.push({ title, link, date });
    if (items.length >= limit) break;
  }
  return items;
}

// --- GitHub stats ----------------------------------------------------------

export interface GitHubStats {
  title: string;
  url: string;
  description?: string;
  stars?: number;
  forks?: number;
  language?: string;
}

export async function fetchGitHub(user: string, repo?: string): Promise<GitHubStats | null> {
  const headers = { Accept: "application/vnd.github+json" };
  if (repo) {
    const data = await fetchJson<any>(`https://api.github.com/repos/${user}/${repo}`, headers);
    if (!data || !data.full_name) return null;
    return {
      title: data.full_name,
      url: data.html_url,
      description: data.description ?? undefined,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language ?? undefined,
    };
  }
  const data = await fetchJson<any>(`https://api.github.com/users/${user}`, headers);
  if (!data || !data.login) return null;
  return {
    title: data.name ?? data.login,
    url: data.html_url,
    description: data.bio ?? undefined,
  };
}

// --- Generic oEmbed (long-tail providers + Bluesky) ------------------------

export interface OEmbedFrame {
  src: string;
  title: string;
  height?: number;
}

/**
 * Resolve a URL to an iframe via oEmbed at build time. Used for the generic
 * `embed` provider and for Bluesky (which needs a handle→DID lookup we don't do
 * ourselves). Returns only the iframe `src` (we rebuild a safe iframe around
 * it), never the provider's raw `html`. Null → caller renders a link fallback.
 */
export async function fetchOEmbed(url: string): Promise<OEmbedFrame | null> {
  const bsky = /(^|\.)bsky\.app\//.test(url) || /\/\/bsky\.app\//.test(url);
  const endpoint = bsky
    ? `https://embed.bsky.app/oembed?url=${encodeURIComponent(url)}`
    : `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
  const data = await fetchJson<any>(endpoint);
  const html: string | undefined = data?.html;
  if (!html) return null;
  const m = html.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (!m) return null;
  const heightAttr = html.match(/<iframe[^>]*\sheight=["']?(\d+)/i);
  return {
    src: m[1],
    title: String(data.title ?? data.provider_name ?? "Embedded content"),
    height: heightAttr ? Number(heightAttr[1]) : (data.height ? Number(data.height) : undefined),
  };
}
