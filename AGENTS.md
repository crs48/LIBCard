# AGENTS.md

Guidance for AI agents (and humans) working in the **LibCard** repository.
LibCard is a free, open-source, self-hostable link-in-bio page + virtual
business card, built as a static site and deployed to GitHub Pages.

## Commit style — Conventional Commits

This repo uses [**Conventional Commits**](https://www.conventionalcommits.org/).
Every commit message must follow:

```
<type>(<optional scope>): <short, imperative summary>

<optional body explaining what & why>

<optional footer(s)>
```

**Types used here:**

| Type | When to use |
|------|-------------|
| `feat` | A new feature for users (a new card section, theme, QR option, …) |
| `fix` | A bug fix |
| `docs` | Documentation only (README, this file, `docs/explorations/**`) |
| `style` | Formatting / whitespace; no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `build` | Build system, dependencies, or tooling (`package.json`, lockfile, Astro/Tailwind config) |
| `ci` | CI/workflow changes (`.github/workflows/**`) |
| `chore` | Repo housekeeping that doesn't fit above (scaffolding, `.gitignore`, skills) |

**Conventions:**

- Summary in the **imperative mood** ("add", not "added"/"adds"), lowercase, no
  trailing period, ideally ≤ 72 chars.
- Use a **scope** when it sharpens intent — e.g. `docs(exploration): …`,
  `feat(vcard): …`, `build(deps): …`.
- Breaking changes: add `!` after the type/scope (`feat!: …`) and/or a
  `BREAKING CHANGE:` footer.

**Examples from this repo:**

```
docs(exploration): explore LibCard architecture, tooling & new-user workflow
docs(exploration): standardize on pnpm as the package manager
feat(vcard): generate contact.vcf at build time
build(deps): add Tailwind CSS v4 via @tailwindcss/vite
```

## Tooling conventions

- **Package manager: pnpm.** Use `pnpm` for everything — `pnpm install`,
  `pnpm build`, `pnpm run setup`. Commit `pnpm-lock.yaml`; never commit
  `package-lock.json` or `yarn.lock`. (Note: invoke project scripts named
  `setup` as `pnpm run setup` — bare `pnpm setup` is pnpm's own built-in.)

## Working in this repo

- **Explorations / design docs** live in `docs/explorations/` and follow the
  `NNNN_[_]_TITLE.md` naming convention (the `[_]` flips to `[x]` once the
  recommendations are implemented). Start design work by reading the latest
  exploration. Commit docs with the `docs(exploration): …` scope.
- Keep the **README in sync** with the actual flow — both the quick-start
  (getting set up) and the **"Updating your card"** section / `docs/UPGRADING.md`
  (staying current). A change to either flow should update its docs in the same PR.
- **Content vs. engine boundary.** A user's files are sacred: `libcard.config.yaml`,
  everything in `public/`, and any theme they authored. Everything else —
  `src/**`, `scripts/**`, build config, `.github/workflows/**`, and the built-in
  `themes/*.yaml` — is the replaceable *engine* that `pnpm run update` syncs from
  upstream. When updating a user's card, never overwrite their content; the build
  regenerates derived files (`libcard.schema.json`, `src/data/themes.json`,
  `src/styles/themes.gen.css`, `themes/theme.schema.json`) so don't hand-edit those.
