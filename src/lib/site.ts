/**
 * URL helpers that respect the GitHub Pages `base` path. Getting `base` wrong is
 * the #1 cause of broken LibCard deploys, so all link/QR/asset URLs go through
 * here rather than being hand-concatenated.
 */

/** Join the base path and a relative path, collapsing duplicate slashes. */
export function withBase(base: string, path = ""): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  const joined = `${b}${p}`;
  return joined === "" ? "/" : joined;
}

/**
 * Absolute URL for a path (origin + base + path). Used where a full URL is
 * required — QR codes, vCard `URL:`, canonical and Open Graph tags. Falls back
 * to a root-relative path if `site` is not configured.
 */
export function absoluteUrl(site: URL | undefined, base: string, path = ""): string {
  const rel = withBase(base, path);
  return site ? new URL(rel, site).href : rel;
}
