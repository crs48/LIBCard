import type { APIRoute } from "astro";
import { renderIcon, ICON_HEADERS } from "../lib/icon";

// PWA / Android "add to home screen" icon (192×192), referenced by the web
// manifest. Opaque, with padding to survive launcher masking.
export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderIcon({ size: 192, padding: 0.1, background: "#ffffff" });
  return new Response(new Uint8Array(png), { headers: ICON_HEADERS });
};
