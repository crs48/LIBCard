import type { APIRoute } from "astro";
import { renderIcon, ICON_HEADERS } from "../lib/icon";

// PNG favicon fallback (32×32) for browsers that don't pick the SVG icon.
// Kept transparent to match favicon.svg's behavior in light/dark tab bars.
export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderIcon({ size: 32 });
  return new Response(new Uint8Array(png), { headers: ICON_HEADERS });
};
