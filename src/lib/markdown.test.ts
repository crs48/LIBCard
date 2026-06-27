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

  it("splits paragraphs and keeps single newlines as breaks", () => {
    const out = renderMarkdown("a\nb\n\nc");
    expect(out).toContain("a<br />b");
    expect(out.match(/<p>/g)?.length).toBe(2);
  });
});
