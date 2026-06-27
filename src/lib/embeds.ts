/**
 * Safe iframe builders for live embeds (Tier 3).
 *
 * Config never carries raw HTML/<iframe> — it names a `provider` + a `url`/`id`,
 * and these helpers map that to a *safe* iframe `src` plus the right sizing and
 * `allow` policy. Every provider here has a deterministic URL transform; ones
 * that need a network lookup (generic oEmbed, Bluesky) are resolved at build
 * time in src/lib/social-fetch.ts instead.
 *
 * The privacy posture lives in the components that consume these specs: video
 * defaults to a click-to-load facade, and every iframe ships `loading="lazy"`,
 * `referrerpolicy="no-referrer"`, a `title`, and a minimal `allow`.
 */

/** How an embed reserves space — a CSS aspect-ratio, or a fixed pixel height. */
export type Sizing = { aspect: string } | { height: number };

export interface EmbedSpec {
  src: string;
  title: string;
  allow?: string;
  sizing: Sizing;
}

export type VideoProvider = "youtube" | "vimeo" | "loom";

const VIDEO_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

/** Normalize to a bare hostname (used for `embed-host`/`parent` params). Accepts
 *  either a bare hostname (e.g. "crs48.github.io") or a full URL. */
function hostOf(value: string | undefined, fallback = "libcard"): string {
  if (!value) return fallback;
  if (!value.includes("://")) return value;
  try {
    return new URL(value).hostname || fallback;
  } catch {
    return fallback;
  }
}

/** Build the iframe spec for a video provider (youtube/vimeo/loom). */
export function buildVideo(provider: VideoProvider, id: string): EmbedSpec {
  switch (provider) {
    case "youtube":
      // youtube-nocookie: no cookie at load (the facade defers everything anyway).
      return {
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`,
        title: "YouTube video",
        allow: VIDEO_ALLOW,
        sizing: { aspect: "16 / 9" },
      };
    case "vimeo":
      return {
        src: `https://player.vimeo.com/video/${encodeURIComponent(id)}`,
        title: "Vimeo video",
        allow: VIDEO_ALLOW,
        sizing: { aspect: "16 / 9" },
      };
    case "loom":
      return {
        src: `https://www.loom.com/embed/${encodeURIComponent(id)}`,
        title: "Loom video",
        allow: VIDEO_ALLOW,
        sizing: { aspect: "16 / 9" },
      };
  }
}

/** A still-image thumbnail for the facade summary, or null (visitor sees a play card). */
export function videoThumbnail(provider: VideoProvider, id: string): string | null {
  if (provider === "youtube") return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return null;
}

/** Add `?autoplay=1` so a revealed facade starts playing on click. */
export function withAutoplay(src: string): string {
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}autoplay=1`;
}

/** Booking providers — plain (lazy) iframes; auto-resize is the only no-JS loss. */
export function buildBooking(
  provider: "calendly" | "calcom" | "gcal",
  url: string,
): EmbedSpec {
  switch (provider) {
    case "gcal":
      // Google Calendar appointment schedule needs gv=true to render inline.
      return {
        src: url.includes("gv=true") ? url : `${url}${url.includes("?") ? "&" : "?"}gv=true`,
        title: "Booking calendar",
        sizing: { height: 700 },
      };
    case "calendly":
      return {
        src: url.includes("?") ? `${url}&hide_gdpr_banner=1` : `${url}?hide_gdpr_banner=1`,
        title: "Booking calendar",
        sizing: { height: 700 },
      };
    case "calcom":
    default:
      return { src: url, title: "Booking calendar", sizing: { height: 700 } };
  }
}

/** Map providers — validated to their own host so config can't smuggle a frame in. */
export function buildMap(provider: "gmaps" | "osm", src: string): EmbedSpec {
  const host = hostOf(src, "");
  const okGoogle = /(^|\.)google\.[a-z.]+$/.test(host);
  const okOsm = /(^|\.)openstreetmap\.org$/.test(host);
  if (provider === "gmaps" && !okGoogle) {
    throw new Error(`map(gmaps): src must be a google.com/maps embed URL, got ${host || src}`);
  }
  if (provider === "osm" && !okOsm) {
    throw new Error(`map(osm): src must be an openstreetmap.org embed URL, got ${host || src}`);
  }
  return { src, title: "Map", sizing: { aspect: "4 / 3" } };
}

/** Pull a Spotify `type/id` path out of an open.spotify.com URL. */
function spotifyPath(url: string): string {
  const m = url.match(/open\.spotify\.com\/(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
  if (!m) throw new Error(`embed(spotify): could not parse a Spotify URL from ${url}`);
  return `${m[1]}/${m[2]}`;
}

/** Pull the numeric video id out of a TikTok URL. */
function tiktokId(urlOrId: string): string {
  if (/^\d+$/.test(urlOrId)) return urlOrId;
  const m = urlOrId.match(/\/video\/(\d+)/);
  if (!m) throw new Error(`embed(tiktok): could not find a video id in ${urlOrId}`);
  return m[1];
}

/**
 * Build the iframe spec for a generic embed provider. `host` is this site's
 * hostname, needed by providers that gate embedding on the embedding domain
 * (Twitch `parent`, Figma `embed_host`).
 */
export function buildEmbed(
  provider: string,
  opts: { url?: string; id?: string; host?: string },
): EmbedSpec {
  const url = opts.url || undefined;
  const id = opts.id || undefined;
  const need = (v: string | undefined, what: string): string => {
    if (!v) throw new Error(`embed(${provider}): missing ${what}`);
    return v;
  };

  switch (provider) {
    case "spotify": {
      const path = id && id.includes("/") ? id : spotifyPath(need(url, "url"));
      return {
        src: `https://open.spotify.com/embed/${path}`,
        title: "Spotify player",
        allow: "encrypted-media; clipboard-write; fullscreen; picture-in-picture",
        sizing: { height: 352 },
      };
    }
    case "applemusic": {
      const u = need(url, "url").replace("music.apple.com", "embed.music.apple.com");
      return {
        src: u,
        title: "Apple Music player",
        allow: "autoplay; encrypted-media; clipboard-write; fullscreen",
        sizing: { height: 450 },
      };
    }
    case "soundcloud": {
      const u = encodeURIComponent(need(url, "url"));
      return {
        src: `https://w.soundcloud.com/player/?url=${u}&visual=true`,
        title: "SoundCloud player",
        allow: "autoplay",
        sizing: { height: 166 },
      };
    }
    case "bandcamp": {
      // Bandcamp's embed URL is its own slash-separated path; pass it through.
      return { src: need(url, "url"), title: "Bandcamp player", sizing: { height: 120 } };
    }
    case "figma": {
      const inner = encodeURIComponent(need(url, "url"));
      return {
        src: `https://www.figma.com/embed?embed_host=${hostOf(opts.host)}&url=${inner}`,
        title: "Figma embed",
        allow: "fullscreen",
        sizing: { aspect: "4 / 3" },
      };
    }
    case "twitch": {
      const channel = need(id || url, "channel id");
      return {
        src: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${hostOf(opts.host)}`,
        title: "Twitch player",
        allow: "autoplay; fullscreen",
        sizing: { aspect: "16 / 9" },
      };
    }
    case "tiktok": {
      const vid = tiktokId(need(id || url, "video id"));
      return {
        src: `https://www.tiktok.com/player/v1/${vid}`,
        title: "TikTok video",
        allow: "autoplay; encrypted-media; fullscreen",
        sizing: { aspect: "9 / 16" },
      };
    }
    case "mastodon": {
      // A status URL → its /embed page (a deterministic transform).
      const u = need(url, "url").replace(/\/?$/, "");
      return {
        src: u.endsWith("/embed") ? u : `${u}/embed`,
        title: "Mastodon post",
        sizing: { height: 400 },
      };
    }
    case "gforms": {
      const u = need(url, "url");
      return {
        src: u.includes("embedded=true") ? u : `${u}${u.includes("?") ? "&" : "?"}embedded=true`,
        title: "Google Form",
        sizing: { height: 700 },
      };
    }
    case "typeform":
      return { src: need(url, "url"), title: "Typeform", sizing: { height: 500 } };
    case "airtable":
      return { src: need(url, "url"), title: "Airtable", sizing: { height: 533 } };
    case "codepen": {
      const u = need(url, "url").replace("/pen/", "/embed/");
      return {
        src: u.includes("default-tab") ? u : `${u}${u.includes("?") ? "&" : "?"}default-tab=result`,
        title: "CodePen",
        sizing: { aspect: "4 / 3" },
      };
    }
    default:
      // bluesky and the generic "oembed" provider are resolved at build time.
      throw new Error(`embed: provider "${provider}" is not a direct-iframe provider`);
  }
}

/** Resolve a Sizing into inline-style values for the wrapper. */
export function sizingStyle(sizing: Sizing, overrideHeight?: number): string {
  if (overrideHeight) return `height:${overrideHeight}px`;
  if ("aspect" in sizing) return `aspect-ratio:${sizing.aspect}`;
  return `height:${sizing.height}px`;
}
