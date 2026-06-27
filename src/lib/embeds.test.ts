import { describe, it, expect } from "vitest";
import { buildVideo, videoThumbnail, withAutoplay, buildBooking, buildMap, buildEmbed, sizingStyle } from "./embeds";

describe("buildVideo", () => {
  it("uses youtube-nocookie for YouTube", () => {
    const s = buildVideo("youtube", "dQw4w9WgXcQ");
    expect(s.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    expect(s.sizing).toEqual({ aspect: "16 / 9" });
  });

  it("builds Vimeo and Loom player URLs", () => {
    expect(buildVideo("vimeo", "12345").src).toBe("https://player.vimeo.com/video/12345");
    expect(buildVideo("loom", "abc").src).toBe("https://www.loom.com/embed/abc");
  });
});

describe("videoThumbnail / withAutoplay", () => {
  it("returns a YouTube thumbnail and null for others", () => {
    expect(videoThumbnail("youtube", "abc")).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
    expect(videoThumbnail("vimeo", "abc")).toBeNull();
  });

  it("appends autoplay with the right separator", () => {
    expect(withAutoplay("https://x/embed/a")).toBe("https://x/embed/a?autoplay=1");
    expect(withAutoplay("https://x/embed/a?rel=0")).toBe("https://x/embed/a?rel=0&autoplay=1");
  });
});

describe("buildBooking", () => {
  it("adds gv=true for Google Calendar", () => {
    expect(buildBooking("gcal", "https://calendar.google.com/x").src).toContain("gv=true");
  });
  it("hides the GDPR banner for Calendly", () => {
    expect(buildBooking("calendly", "https://calendly.com/me/30min").src).toContain("hide_gdpr_banner=1");
  });
});

describe("buildMap", () => {
  it("accepts a google.com maps embed URL", () => {
    expect(buildMap("gmaps", "https://www.google.com/maps/embed?pb=xyz").src).toContain("google.com");
  });
  it("rejects a non-provider host", () => {
    expect(() => buildMap("gmaps", "https://evil.example/iframe")).toThrow();
    expect(() => buildMap("osm", "https://www.google.com/maps")).toThrow();
  });
});

describe("buildEmbed", () => {
  it("derives a Spotify embed from a share URL", () => {
    const s = buildEmbed("spotify", { url: "https://open.spotify.com/track/abc123" });
    expect(s.src).toBe("https://open.spotify.com/embed/track/abc123");
  });

  it("passes this site's host to Twitch (parent) and Figma (embed_host)", () => {
    expect(buildEmbed("twitch", { id: "somechannel", host: "crs48.github.io" }).src).toContain("parent=crs48.github.io");
    expect(buildEmbed("figma", { url: "https://www.figma.com/design/KEY", host: "crs48.github.io" }).src).toContain(
      "embed_host=crs48.github.io",
    );
  });

  it("transforms a Mastodon status URL into its /embed page", () => {
    expect(buildEmbed("mastodon", { url: "https://mas.to/@me/123" }).src).toBe("https://mas.to/@me/123/embed");
  });

  it("extracts a TikTok video id from a share URL", () => {
    expect(buildEmbed("tiktok", { url: "https://www.tiktok.com/@me/video/7200000000000000000" }).src).toBe(
      "https://www.tiktok.com/player/v1/7200000000000000000",
    );
  });

  it("throws on a known provider with missing input", () => {
    expect(() => buildEmbed("spotify", {})).toThrow();
  });

  it("throws for providers resolved at build time (bluesky/oembed)", () => {
    expect(() => buildEmbed("bluesky", { url: "https://bsky.app/x" })).toThrow();
  });
});

describe("sizingStyle", () => {
  it("emits aspect-ratio or height, with an override", () => {
    expect(sizingStyle({ aspect: "16 / 9" })).toBe("aspect-ratio:16 / 9");
    expect(sizingStyle({ height: 352 })).toBe("height:352px");
    expect(sizingStyle({ aspect: "16 / 9" }, 500)).toBe("height:500px");
  });
});
