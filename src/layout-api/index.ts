/** Public API 1. Package authors import this module, never engine internals. */
export type { PageModelV1, LayoutProps, ResolvedLink, ProfileAction, ResolvedSection } from "./model";
export type { PageSection, LinkSection } from "../lib/page";
export { default as Profile } from "../components/Profile.astro";
export { default as ProfileActions } from "../components/ProfileActions.astro";
export { default as SocialRow } from "../components/SocialRow.astro";
export { default as Section } from "../components/Section.astro";
export { default as Block } from "../components/Block.astro";
export { default as Link } from "../components/LinkButton.astro";
export { default as EditorialLink } from "../components/EditorialLink.astro";
export { default as Icon } from "../components/Icon.astro";
export { default as CardReveal } from "../components/CardReveal.astro";
export { default as Classic } from "../layouts/Classic.astro";
export { default as Editorial } from "../layouts/Editorial.astro";
export { withBase, absoluteUrl } from "../lib/site";
export { renderMarkdown } from "../lib/markdown";
