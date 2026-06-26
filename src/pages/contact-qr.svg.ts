import type { APIRoute } from "astro";
import QRCode from "qrcode";
import { getConfig } from "../lib/config";
import { buildVCard } from "../lib/vcard";

// A QR code that encodes the vCard *itself* (not a URL), so scanning it saves
// the contact fully offline — ideal for printing on a physical badge. Generated
// at build time as a crisp, scalable SVG.
export const prerender = true;

export const GET: APIRoute = async () => {
  const cfg = await getConfig();
  const vcard = buildVCard({
    name: cfg.profile.name,
    email: cfg.contact.email || undefined,
    phone: cfg.contact.phone || undefined,
    organization: cfg.contact.organization,
    title: cfg.contact.title,
    website: cfg.contact.website || undefined,
  });

  const svg = await QRCode.toString(vcard, {
    type: "svg",
    margin: 2,
    width: 600,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contact-qr.svg"',
    },
  });
};
