import type { APIRoute } from "astro";
import { renderIcon, ICON_HEADERS } from "../lib/icon";

// iOS/iPadOS home-screen icon. Safari fetches /apple-touch-icon.png by
// convention; 180×180 is the current high-DPI size. Opaque white background
// (home-screen icons can't be transparent) with a little padding so the mark
// isn't clipped by the system's rounded-rect mask.
export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderIcon({ size: 180, padding: 0.1, background: "#ffffff" });
  return new Response(new Uint8Array(png), { headers: ICON_HEADERS });
};
