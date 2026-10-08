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

/** **bold** then *italic* (and __bold__ / _italic_). */
function renderEmphasis(text: string): string {
  let out = text;
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  return out;
}

// Placeholders for already-rendered spans. Emphasis must never see the inside
// of a code span, a URL (`a_b_c`), or the `target="_blank"` attributes we add —
// two external links in one paragraph would otherwise pair their underscores
// into a bogus <em> and corrupt the markup. NUL can't occur in escaped input.
const HOLE = "\u0000";
const HOLE_RE = /\u0000(\d+)\u0000/g;

function renderInline(escaped: string): string {
  const stash: string[] = [];
  const keep = (html: string) => `${HOLE}${stash.push(html) - 1}${HOLE}`;
  let out = escaped;

  // `code` first, so * and _ inside a code span are left alone. Code spans can't
  // contain backticks here (kept simple on purpose).
  out = out.replace(/`([^`]+)`/g, (_m, code) => keep(`<code>${code}</code>`));

  // [label](url) — the label still gets emphasis; the href and attributes don't.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const href = safeHref(url);
    const ext = /^https?:\/\//i.test(href);
    const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : "";
    return keep(`<a href="${href}"${attrs}>${renderEmphasis(label)}</a>`);
  });

  out = renderEmphasis(out);

  return out.replace(HOLE_RE, (_m, i) => stash[Number(i)]!);
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
