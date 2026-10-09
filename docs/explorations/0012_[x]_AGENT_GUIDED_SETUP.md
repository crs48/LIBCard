# Agent-guided LibCard setup

The invitation in “Like this site?” should let someone copy a prompt into their
coding agent and start a guided setup in their connected GitHub workspace.
The existing terminal wizard is interactive and retains some demo values, so
the agent workflow should edit configuration directly after asking for content.

## Design

```mermaid
flowchart LR
  P[src/lib/setup-prompt.txt] --> B[Configurable copy-prompt block]
  P --> T[/setup-prompt.txt]
  B --> A[User pastes into coding agent]
  A --> G[docs/AGENT_SETUP.md]
  G --> R[Inspect repo, customize, preview, publish]
```

Add a shared `copy-prompt` content block. Omitting `text` uses the canonical
LibCard setup prompt; users can supply their own text and button label. This is
an opt-in clipboard enhancement with a selectable textarea fallback, not a
maintainer-only component. Multiple blocks must work independently. Text stays
escaped, including markup or script-shaped text.

The guide handles existing LibCards, empty connected repositories, unrelated
apps, and missing GitHub access. It asks for a few personal details, removes
demo-owner content on fresh installs, preserves existing work, derives Pages
paths, previews, and publishes within the person's authorization.

## Checklist

- [x] Read the existing setup, content-block, theme, and upgrade flows.
- [x] Add one prompt source, a plain-text endpoint, and the agent guide.
- [x] Add the shared schema/renderer and opt into the personal site's section.
- [x] Keep README, AGENTS, upgrade notes, and changelog consistent.
- [x] Verify schema validation, escaped custom text, and multiple instances.
- [x] Browser-check clipboard success, failure fallback, no JavaScript, keyboard
      access, narrow layout, and Frost/Dawn themes.
- [x] Build a minimal fresh-site config with a project base path and no copy block;
      confirm the clipboard script is absent and setup instructions are usable.
- [x] Run build, typecheck, and tests.

Validation: 155 tests pass, Astro reports no type errors/warnings, and the main
site plus minimal and multiple-prompt fixture builds pass. Chrome checks at
1100px and 390px confirm Frost/Dawn layout, exact clipboard text, denial fallback
with focus/selection, keyboard activation, and a readable no-JS prompt. A second
fixture at `/links` confirms two independent blocks, escaped script-shaped text,
the plain-text endpoint, and the fallback avatar. The minimal fixed-theme build
contains no client scripts. Browser captures/scripts are local artifacts under
`output/playwright/setup-*` and `check-*-prompt*.js`.

No real visitor repository will be created as part of testing this feature.
GitHub access, repository policies, and the visitor's choices remain environment
dependencies; the prompt must describe those limits rather than promise that a
repository connection alone guarantees publication.
