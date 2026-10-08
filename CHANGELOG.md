# Changelog

What changed in each LibCard release, newest first. Use this to decide whether
an update is worth pulling — see [docs/UPGRADING.md](./docs/UPGRADING.md) for how.

Entries marked **⚠ Action needed** require a one-time change on your side (most
often to `libcard.config.yaml`); everything else is picked up automatically by
`pnpm run update` + a rebuild.

## Unreleased

- **Feedme as the primary tip button.** A `tip-buttons` block can now set
  `feedme: true` to lead with a full-width "Tip at <host>" button that opens
  your Feedme checkout, plus a one-line explainer of why to tip there rather
  than via Venmo/PayPal (built-in copy, your own `feedmeNote`, or `false`).
  The provider row renders below it as before. Requires the `feedme:` block to
  be enabled; off by default, existing blocks are unchanged. Pair it with
  `feedme.give: false` to drop the header "Give to <name>" button so the
  checkout link appears once, with your other tip links.
- **Tips with Feedme (optional, off by default).** A new `feedme:` block plus
  per-link / per-social `feedme: { id, blurb, aspiration }` opt-ins add a
  "Give to <name>" CTA and a ♥ "More of this" action beside the items you
  choose, each opening your own self-hosted [Feedme](https://github.com/crs48/feedme)
  checkout with that target pre-selected. At build time LibCard fetches Feedme's
  public aggregate once (fail-soft, no secrets, no runtime JS) and bakes in each
  target's public pick share and tip count. Existing configs are untouched:
  without the block nothing is fetched and nothing renders. Guide:
  [docs/FEEDME.md](./docs/FEEDME.md).
- **`LIBCARD_CONFIG` for fixture builds.** `LIBCARD_CONFIG=path.yaml pnpm build`
  builds another config file (used by the Feedme fixtures) without editing
  `libcard.config.yaml`.
- **Substack in the social row.** `platform: substack` now renders the
  Substack mark with its brand-orange hover, alongside the other social icons.
- **Pair a site with its GitHub repo on one row.** A link can now carry a
  `github:` repo URL. The row shows the site as the main button and a compact
  GitHub pill (the mark + star count, per the existing `stars` modes) to its
  right — so "here's the app, here's the code" takes one line instead of two.
  Existing `star: true` repo links are unchanged.
- **Glass themes no longer flicker.** The frosted panels on Frost, Dusk, Dawn,
  and Mist could shimmer or flash intermittently — the drifting mesh background
  ran a live 60px blur and a scale/rotate animation that periodically forced the
  GPU to redraw the layer the glass sits on. The mesh's softness is now baked
  into the gradients themselves and the drift is translate-only, so the glass
  effect looks the same but the flicker is gone. No config changes needed.

## 0.2.0

- **Rich content blocks & zero-JS embeds.** Cards now carry typed *content
  blocks* beyond plain links — markdown prose, build-time-fetched content, and
  zero-JavaScript embeds — rendered straight onto the page via a new `blocks`
  list, with matching contact/embed icons.
- **Frost, the flagship glass theme — and a Frost family.** A new pastel-mesh
  background with frosted-glass buttons and panels, joined by **Dusk**, **Dawn**,
  and **Mist** variants. Glass now applies to every panel (including the Save
  Contact CTA), tuned to stay subtle. Built-in themes are credited to their author.
- **Cookieless analytics (opt-in).** Drop in a privacy-friendly GoatCounter or
  Umami beacon — including a no-JS outbound-link tagger — entirely behind a config
  block. Off by default: no cookies, no consent banner.
- **Installable card: app icon, PWA manifest & favicons.** LibCard now ships a
  web app manifest and icon set so a card can be added to a phone home screen,
  plus a friendly smiley stacked-cards favicon with fallbacks.
- **Save contact, right on the card.** The landscape "card mode" face (turn a
  phone sideways) now carries a compact **Save contact** button, front and
  center beside the QR — one tap saves the vCard without leaving the card.
  Still zero JavaScript; the portrait `/card` page is unchanged.
- **First-run nudge (opt-in).** A fresh "Use this template" card can show a
  subtle "edit `libcard.config.yaml`" banner until it's customized — set
  `meta.default: true` to switch it on, and remove it once the card is yours.
  Off by default, so a real card never shows it. Zero JavaScript.
- **"Make your own" made easy.** The README documents a one-line link/`text`
  pattern for inviting visitors to spin up their own card, and the footer credit
  is now consistently **"Powered by LibCard"** across the page, README, and
  trademark note (it still links back to the project and stays removable).
- **Social icons, refined.** Social icons now sit just below your profile (above
  the links) and reveal their brand color on hover.
- **A curated random-theme pool.** The "surprise me" randomizer draws from a
  hand-picked pool (Frost, Dusk, Dawn, Mist, …) curated independently of the live
  switcher ring.
- **Fixes.** Stop frosted-glass panels from flickering on hover and over time,
  and stop a theme-change flicker at the end of the switch animation.

## 0.1.0

- First tagged release: link-in-bio page, tap-to-save vCard, QR business card,
  landscape "card mode", a GitHub star button, and built-in themes with an
  optional live switcher — all from one-file (`libcard.config.yaml`)
  configuration deployed to GitHub Pages.
- **Updating made easy.** `pnpm run update` pulls the latest engine from upstream
  while never touching your `libcard.config.yaml`, `public/`, or themes you
  wrote. Includes a "Updating your card" guide
  ([docs/UPGRADING.md](./docs/UPGRADING.md)) and an opt-in `update-check` workflow.
