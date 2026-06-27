# Changelog

What changed in each LibCard release, newest first. Use this to decide whether
an update is worth pulling — see [docs/UPGRADING.md](./docs/UPGRADING.md) for how.

Entries marked **⚠ Action needed** require a one-time change on your side (most
often to `libcard.config.yaml`); everything else is picked up automatically by
`pnpm run update` + a rebuild.

## Unreleased

_Nothing yet._

## 0.1.0

- First tagged release: link-in-bio page, tap-to-save vCard, QR business card,
  landscape "card mode", a GitHub star button, and built-in themes with an
  optional live switcher — all from one-file (`libcard.config.yaml`)
  configuration deployed to GitHub Pages.
- **Updating made easy.** `pnpm run update` pulls the latest engine from upstream
  while never touching your `libcard.config.yaml`, `public/`, or themes you
  wrote. Includes a "Updating your card" guide
  ([docs/UPGRADING.md](./docs/UPGRADING.md)) and an opt-in `update-check` workflow.
