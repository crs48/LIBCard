import type { APIRoute } from "astro";
import { getConfig } from "../lib/config";
import { buildVCard } from "../lib/vcard";

// Prerendered at build time → a static contact.vcf on the CDN. The download
// headers make phones open the native "Add to Contacts" sheet.
export const prerender = true;

export const GET: APIRoute = async () => {
  const cfg = await getConfig();
  const body = buildVCard({
    name: cfg.profile.name,
    email: cfg.contact.email || undefined,
    phone: cfg.contact.phone || undefined,
    organization: cfg.contact.organization,
    title: cfg.contact.title,
    website: cfg.contact.website || undefined,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contact.vcf"',
    },
  });
};
