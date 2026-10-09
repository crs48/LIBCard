import type { APIRoute } from "astro";
import prompt from "../lib/setup-prompt.txt?raw";

export const GET: APIRoute = () => new Response(prompt, {
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});
