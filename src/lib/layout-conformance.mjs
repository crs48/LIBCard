import { parse } from "parse5";
const flatten = (node) => [node, ...(node.childNodes ?? []).flatMap(flatten)];
const attr = (node, name) => node.attrs?.find((a) => a.name === name);

/** A layout may replace the composition, but must keep the core utility slot. */
export function assertLayoutShell(html) {
  const nodes = flatten(parse(html));
  const mains = nodes.filter((n) => n.tagName === "main");
  const utilities = nodes.filter((n) => attr(n, "data-libcard-utilities"));
  if (mains.length !== 1 || attr(mains[0], "id")?.value !== "main-content") throw new Error('Layout API 1 requires exactly one <main id="main-content">.');
  if (utilities.length !== 1 || flatten(mains[0]).includes(utilities[0])) throw new Error('Layout API 1 requires the named utilities slot exactly once, outside main. It preserves credits, privacy disclosures, and card mode.');
}
