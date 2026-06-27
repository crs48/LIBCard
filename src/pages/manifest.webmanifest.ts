import type { APIRoute } from "astro";
import { getConfig, getActiveTheme } from "../lib/config";
import { getThemeMeta } from "../lib/themes";

// Web App Manifest: lets visitors install the card as a PWA ("Add to Home
// Screen") with the right name and icon. Icon `src` values are relative so they
// resolve against the manifest's own URL — which keeps the GitHub Pages `base`
// path correct without hand-joining it here. Colors come from the active theme
// so the install splash matches the live card, mirroring og.png.ts.
export const prerender = true;

export const GET: APIRoute = async () => {
  const cfg = await getConfig();
  const active = await getActiveTheme();
  const tokens = getThemeMeta(active.name)?.tokens;

  const name = cfg.profile.name;
  const shortName = name.length <= 12 ? name : "LibCard";

  const manifest = {
    name,
    short_name: shortName,
    description: cfg.seo?.description ?? cfg.profile.tagline ?? `${name}'s links, all in one place.`,
    id: ".",
    start_url: ".",
    scope: ".",
    display: "standalone",
    background_color: tokens?.bg ?? "#0b1120",
    theme_color: tokens?.accent ?? "#6366f1",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
