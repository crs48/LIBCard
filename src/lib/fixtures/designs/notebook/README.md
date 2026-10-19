> Reference fixture, not a published release. The author and source URLs are placeholders. Install locally from LibCard with `pnpm run design:add -- ./src/lib/fixtures/designs/notebook`.

# notebook

A personal layout for portable LibCard content.

Select `design: example/notebook` in your LibCard config. Requires Layout API 1, Astro 5.13+, and LibCard 0.2+.

This design renders all portable sections through the core block fallback. It adds no client JavaScript or remote assets. Content may still enable its own embeds, integrations, and scripts.

Run `pnpm run design:check -- example/notebook` and `pnpm run design:preview -- example/notebook` from LibCard. Add the generated desktop/mobile PNGs to this package, list them in `files` and `previews`, and set the manifest's `source` to your release repository before publishing.

Export with `pnpm run design:export -- example/notebook ./output/notebook`. Publish that directory as its own Git repository, tag v1.0.0, and share the repository URL. No engine files or private owner content are exported.

See LibCard's docs/DESIGNS.md for the public API, options, assets, and release workflow.
