/**
 * A tiny, deliberately limited Markdown→HTML renderer for `text` blocks.
 *
 * The whole point is safety: config is "data, not code", so a `text` block must
 * never be able to inject markup. We HTML-escape the input FIRST, then apply a
 * small whitelist of inline transforms (bold, italic, code, links) and
 * paragraph/line-break handling. No raw HTML survives, and link hrefs are
 * restricted to safe schemes. This adds zero dependencies and runs at build.
 */

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

/** Allow only schemes that can't execute script (no `javascript:`, `data:`…). */
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|sms:|\/)/i;
function safeHref(raw: string): string {
  // The url was HTML-escaped, so `&` is `&amp;` — fine inside an attribute.
  const url = raw.trim();
  return SAFE_URL.test(url) ? url : "#";
}

function renderInline(escaped: string): string {
  let out = escaped;

  // `code` first, so * and _ inside a code span are left alone. Code spans can't
  // contain backticks here (kept simple on purpose).
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  // [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const href = safeHref(url);
    const ext = /^https?:\/\//i.test(href);
    const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${href}"${attrs}>${label}</a>`;
  });

  // **bold** then *italic* (and __bold__ / _italic_)
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  return out;
}

/** Render limited Markdown to safe HTML. Blank lines split paragraphs; single
 *  newlines become <br>. */
export function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input.replace(/\r\n/g, "\n").trim());
  const paragraphs = escaped.split(/\n{2,}/);
  return paragraphs
    .map((p) => `<p>${renderInline(p).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}
