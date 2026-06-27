import type { APIRoute } from "astro";
import { renderIcon, ICON_HEADERS } from "../lib/icon";

// Large PWA icon (512×512) — used for install prompts and the splash screen,
// and as the source most platforms downscale from. Opaque, with padding.
export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderIcon({ size: 512, padding: 0.1, background: "#ffffff" });
  return new Response(new Uint8Array(png), { headers: ICON_HEADERS });
};
