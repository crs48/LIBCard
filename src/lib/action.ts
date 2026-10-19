import type { LibcardConfig } from "./config";
import { withBase } from "./site";

/** Resolve optional header/corner links once, including native app handlers. */
export function resolveAction(action: LibcardConfig["headerAction"], base: string) {
  if (!action) return null;
  const href = action.url.startsWith("/") ? withBase(base, action.url) : action.url;
  return {
    label: action.label,
    icon: action.icon,
    href,
    newTab: action.newTab && !/^(mailto:|tel:|sms:)/i.test(href),
  };
}
