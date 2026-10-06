import { LINK_STATUSES } from "./schema.mjs";

/** One of the fixed `status:` slugs a link may carry (see schema.mjs). */
export type LinkStatus = (typeof LINK_STATUSES)[number];

/**
 * Default chip copy per status. Deliberately plain so any visitor reads it at a
 * glance; an owner rephrases any entry via the top-level `statuses:` map in
 * libcard.config.yaml (e.g. `wip: Building`) without touching the engine.
 */
export const STATUS_LABELS: Record<LinkStatus, string> = {
  ready: "Ready",
  wip: "In progress",
  experiment: "Experiment",
  exploration: "Exploration",
  writing: "Writing",
  reading: "Reading",
  dormant: "Dormant",
};

export interface ResolvedStatus {
  slug: LinkStatus;
  label: string;
}

/**
 * Turn a link's `status` slug into the chip to render, applying the owner's
 * label overrides. `undefined` (no status set) → `null` (no chip), so unbadged
 * links render exactly as before.
 */
export function resolveStatus(
  slug: LinkStatus | undefined,
  overrides: Partial<Record<LinkStatus, string>> = {},
): ResolvedStatus | null {
  if (!slug) return null;
  const custom = overrides[slug]?.trim();
  return { slug, label: custom || STATUS_LABELS[slug] };
}
