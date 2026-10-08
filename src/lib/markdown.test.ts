import { describe, it, expect } from "vitest";
import { escapeHtml, renderMarkdown } from "./markdown";

describe("escapeHtml", () => {
  it("escapes the five dangerous characters", () => {
    expect(escapeHtml(`<a href="x" foo='y'>&`)).toBe("&lt;a href=&quot;x&quot; foo=&#39;y&#39;&gt;&amp;");
  });
});

describe("renderMarkdown", () => {
  it("never lets raw HTML through", () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders bold, italic and code", () => {
    expect(renderMarkdown("**b**")).toContain("<strong>b</strong>");
    expect(renderMarkdown("*i*")).toContain("<em>i</em>");
    expect(renderMarkdown("`c`")).toContain("<code>c</code>");
  });

  it("renders safe links and rejects javascript: URLs", () => {
    expect(renderMarkdown("[site](https://example.com)")).toContain('href="https://example.com"');
    expect(renderMarkdown("[x](javascript:alert(1))")).toContain('href="#"');
  });

  it("opens external links in a new tab", () => {
    expect(renderMarkdown("[site](https://example.com)")).toContain('target="_blank"');
    expect(renderMarkdown("[mail](mailto:a@b.com)")).not.toContain("target=");
  });

  it("keeps two external links in one paragraph intact (no emphasis across their _blank attributes)", () => {
    const html = renderMarkdown("See [one](https://a.example) and [two](https://b.example) today.");
    expect(html).toBe(
      '<p>See <a href="https://a.example" target="_blank" rel="noopener noreferrer">one</a> and ' +
        '<a href="https://b.example" target="_blank" rel="noopener noreferrer">two</a> today.</p>',
    );
    expect(html).not.toContain("<em>");
  });

  it("leaves underscores inside URLs and code alone, but still emphasizes link labels", () => {
    expect(renderMarkdown("[a](https://x.example/p_q_r) and `a_b_c` and _it_")).toBe(
      '<p><a href="https://x.example/p_q_r" target="_blank" rel="noopener noreferrer">a</a> and <code>a_b_c</code> and <em>it</em></p>',
    );
    expect(renderMarkdown("[**bold** label](/here)")).toBe('<p><a href="/here"><strong>bold</strong> label</a></p>');
  });

  it("splits paragraphs and keeps single newlines as breaks", () => {
    const out = renderMarkdown("a\nb\n\nc");
    expect(out).toContain("a<br />b");
    expect(out.match(/<p>/g)?.length).toBe(2);
  });
});
