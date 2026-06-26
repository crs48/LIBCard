import { describe, it, expect } from "vitest";
import { buildVCard, escapeVCardValue } from "./vcard";

describe("escapeVCardValue", () => {
  it("escapes backslash, comma, semicolon and newline", () => {
    expect(escapeVCardValue("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeVCardValue("Chris Smothers")).toBe("Chris Smothers");
  });
});

describe("buildVCard", () => {
  it("emits a well-formed 3.0 header and footer", () => {
    const v = buildVCard({ name: "Chris Smothers" });
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0")).toBe(true);
    expect(v.endsWith("END:VCARD")).toBe(true);
  });

  it("splits the name into FN and structured N", () => {
    const v = buildVCard({ name: "Chris Smothers" });
    expect(v).toContain("FN:Chris Smothers");
    expect(v).toContain("N:Smothers;Chris;;;");
  });

  it("omits optional fields that are not provided", () => {
    const v = buildVCard({ name: "Ada Lovelace" });
    expect(v).not.toContain("TEL");
    expect(v).not.toContain("EMAIL");
    expect(v).not.toContain("ORG");
  });

  it("includes every provided field", () => {
    const v = buildVCard({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1-555-123-4567",
      organization: "Analytical Engines",
      title: "Engineer",
      website: "https://example.com",
    });
    expect(v).toContain("ORG:Analytical Engines");
    expect(v).toContain("TITLE:Engineer");
    expect(v).toContain("TEL;TYPE=CELL:+1-555-123-4567");
    expect(v).toContain("EMAIL;TYPE=INTERNET:ada@example.com");
    expect(v).toContain("URL:https://example.com");
  });

  it("escapes commas and semicolons in text fields", () => {
    const v = buildVCard({ name: "Doe, John", organization: "A; B, C" });
    expect(v).toContain("FN:Doe\\, John");
    expect(v).toContain("ORG:A\\; B\\, C");
  });

  it("uses CRLF line endings", () => {
    expect(buildVCard({ name: "X Y" })).toContain("\r\n");
  });
});
