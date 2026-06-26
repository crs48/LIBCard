/**
 * Build a vCard 3.0 string — the format phones understand as a contact card.
 * Version 3.0 is the most broadly compatible across iOS, Android, Google
 * Contacts and Outlook. Pure and framework-agnostic so it's easy to unit test.
 */

export interface VCardInput {
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  title?: string;
  website?: string;
}

/**
 * Escape a free-text vCard value per RFC 6350 / 2426: backslash, newline,
 * comma and semicolon are the structural characters that must be escaped.
 */
export function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Build a complete vCard 3.0 document (CRLF line endings, as the spec wants). */
export function buildVCard(input: VCardInput): string {
  const name = input.name.trim();
  const parts = name.split(/\s+/);
  const first = parts.shift() ?? "";
  const last = parts.join(" ");
  const e = escapeVCardValue;

  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    // N is structured (Family;Given;Additional;Prefix;Suffix) — escape each part.
    `N:${e(last)};${e(first)};;;`,
    `FN:${e(name)}`,
  ];

  if (input.organization) lines.push(`ORG:${e(input.organization)}`);
  if (input.title) lines.push(`TITLE:${e(input.title)}`);
  // EMAIL/TEL/URL are structured single values without commas/semicolons in
  // practice; leaving them unescaped maximizes parser compatibility.
  if (input.phone) lines.push(`TEL;TYPE=CELL:${input.phone}`);
  if (input.email) lines.push(`EMAIL;TYPE=INTERNET:${input.email}`);
  if (input.website) lines.push(`URL:${input.website}`);

  lines.push("END:VCARD");
  return lines.join("\r\n");
}
