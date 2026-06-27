import type { APIRoute } from "astro";
import { renderIcon, ICON_HEADERS } from "../lib/icon";

// Maskable variant (512×512) for Android adaptive icons: extra padding keeps the
// mark inside the ~80% safe zone so circular/squircle masks don't clip it.
// Referenced with purpose "maskable" in the web manifest.
export const prerender = true;

export const GET: APIRoute = async () => {
  const png = await renderIcon({ size: 512, padding: 0.18, background: "#ffffff" });
  return new Response(new Uint8Array(png), { headers: ICON_HEADERS });
};
