# LibCard

**Link in Bio Card** — a free, fast way to set up your own link-in-bio page and virtual business card.

LibCard is a tiny [Astro](https://astro.build) static site you host on **GitHub Pages for free**. Think Linktree, but it's *yours*: a single page that collects all your links and doubles as a virtual business card you can share with people at conferences, in your social bios, or anywhere a QR code or short link fits.

## Why LibCard?

- **Free hosting** — runs entirely on GitHub Pages, no server or subscription.
- **Fast to set up** — edit one config file, push. Your page is live.
- **Tap to save contact** — a "Save contact" button downloads a vCard, so anyone can add you to their phone's address book in one tap.
- **QR business card** — built-in QR codes for conferences: one points to your page, another saves your contact offline.
- **Yours to own** — no third-party platform between you and your audience; you control the content and the domain.
- **Fast & private** — zero client-side JavaScript by default; nothing to track you.

## Quick start

1. **Use this template.** Click **“Use this template” → Create a new repository**. Name it `your-links` (a project site) or `your-username.github.io` (a user site).
2. **Make it yours.** Edit [`libcard.config.yaml`](./libcard.config.yaml) — your name, tagline, links, socials, contact details, and theme. That's the only file you need to touch.
   - Prefer prompts? Clone the repo and run `pnpm install && pnpm run setup` for an interactive wizard that fills the config in for you (including the tricky `site.url` / `site.base`).
3. **Turn on Pages.** In your repo, go to **Settings → Pages → Build and deployment** and set **Source: GitHub Actions**.
4. **Push.** Every push to `main` rebuilds and deploys automatically (via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)). Your card goes live at `https://<username>.github.io/<repo>/`.

> [!IMPORTANT]
> Set **`site.base`** correctly in `libcard.config.yaml`: use `"/<repo-name>"` for a project site (e.g. `/your-links`) or `"/"` for a `username.github.io` user site or a custom domain. A wrong `base` is the #1 cause of broken styling/links.

## Configure it

Everything lives in `libcard.config.yaml`. The `# yaml-language-server: $schema=./libcard.schema.json` line at the top gives you **autocomplete and inline validation** in editors like VS Code. A bad value (malformed email, unknown theme, typo'd field) **fails the build** with a readable error instead of shipping a broken card.

```yaml
profile:
  name: Ada Lovelace
  tagline: Mathematician · first programmer
  avatar: /avatar.svg
links:
  - label: My website
    url: https://example.com
    icon: globe
socials:
  - platform: github
    url: https://github.com/ada
contact:
  email: ada@example.com
theme: midnight   # default | midnight | sunset | mono
```

### Themes

Set `theme:` to one of `default`, `midnight`, `sunset`, or `mono`. Themes are plain CSS-variable token sets in [`src/themes/`](./src/themes/) — copy one to add your own.

### Custom domain (optional)

GitHub Pages supports custom domains for free. Add a `public/CNAME` file containing your domain, point your DNS at GitHub Pages, and set `site.base: "/"` (and `site.url` to your domain) in the config.

## Set it up with an AI agent

LibCard is designed to be configured by an AI coding agent (e.g. Claude Code). The whole contract is one file plus its JSON Schema:

> Fill in `libcard.config.yaml` for me. The allowed fields, types, and the theme
> enum are defined in `libcard.schema.json` — validate against it. Use my GitHub
> repo to set `site.url`/`site.base`, then run `pnpm build` to confirm it's valid.

Because [`libcard.schema.json`](./libcard.schema.json) is committed and generated from the same Zod schema the build uses, the agent knows exactly what's allowed and the build will reject anything invalid.

## Local development

```bash
pnpm install      # install dependencies (uses pnpm)
pnpm dev          # local preview at http://localhost:4321
pnpm build        # production build into dist/ (regenerates libcard.schema.json)
pnpm run setup    # interactive config wizard
pnpm test         # run the vCard unit tests
pnpm typecheck    # astro check
```

## How it works

- **Astro** static output → fast, CDN-friendly HTML with no runtime JS.
- **Tailwind CSS v4** for styling; theming via CSS-variable `@theme` tokens.
- One **Zod** schema is the single source of truth: it validates the config at build time *and* generates `libcard.schema.json` for editors/agents.
- The **vCard** (`/contact.vcf`) and **QR codes** (page-URL QR + offline vCard-QR) are generated at build time — zero client JavaScript.

## License

[MIT](./LICENSE) — free to use, fork, modify, and redistribute, including
commercially. Just keep the copyright notice.

The MIT License covers the **code**, not the **name**. The "LibCard" name and
logo are not licensed for reuse — if you fork it, ship it under your own name.
See [TRADEMARK.md](./TRADEMARK.md).
