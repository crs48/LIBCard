// Shared traversal for schema refinement and runtime disclosures. Do not select
// one branch here: validation must also inspect an invalid mixed-mode input.
export function blockEntries(doc) {
  const entries = [
    ...(doc.blocks ?? []).map((block, index) => ({ block, path: ["blocks", index] })),
    ...(doc.sections ?? []).flatMap((block, index) =>
      ["links", "blocks"].includes(block.type) ? [] : [{ block, path: ["sections", index] }]),
  ];
  return entries.flatMap((entry) => [
    entry,
    ...(entry.block.type === "disclosure" ? entry.block.blocks.map((block, index) => ({
      block, path: [...entry.path, "blocks", index],
    })) : []),
  ]);
}

export function validateSections(doc, ctx) {
  const issue = (path, message) => ctx.addIssue({ code: "custom", path, message });
  const ids = new Set();
  doc.links.forEach((link, index) => {
    if (!link.id) {
      if (doc.sections) issue(["links", index, "id"], "Every link needs an id when sections are configured.");
      return;
    }
    if (ids.has(link.id)) issue(["links", index, "id"], `Duplicate link id "${link.id}".`);
    ids.add(link.id);
  });
  if (!doc.sections) return;
  const blockPlacements = doc.sections.filter((section) => section.type === "blocks").length;
  if (doc.blocks.length && blockPlacements !== 1) issue(["sections"], 'Place existing blocks exactly once using { type: "blocks" }, or move them into sections.');
  if (blockPlacements > 1 && !doc.blocks.length) issue(["sections"], 'Use { type: "blocks" } at most once.');
  const groups = new Set();
  const placed = new Set();
  doc.sections.forEach((section, index) => {
    if (section.type !== "links") return;
    if (groups.has(section.id)) issue(["sections", index, "id"], `Duplicate section id "${section.id}".`);
    groups.add(section.id);
    section.items.forEach((id, item) => {
      const path = ["sections", index, "items", item];
      if (!ids.has(id)) issue(path, `Unknown link id "${id}".`);
      if (placed.has(id)) issue(path, `Link "${id}" is placed more than once.`);
      placed.add(id);
    });
  });
  doc.links.forEach((link, index) => {
    if (link.id && !placed.has(link.id)) issue(["links", index, "id"], `Place link "${link.id}" in a section (including an archive if desired).`);
  });
}
