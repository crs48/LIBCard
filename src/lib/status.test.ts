import { describe, it, expect } from "vitest";
import { LINK_STATUSES } from "./schema.mjs";
import { STATUS_LABELS, resolveStatus } from "./status";

describe("resolveStatus", () => {
  it("returns null when a link has no status", () => {
    expect(resolveStatus(undefined)).toBeNull();
    expect(resolveStatus(undefined, { wip: "Building" })).toBeNull();
  });

  it("uses the default copy when there is no override", () => {
    expect(resolveStatus("wip")).toEqual({ slug: "wip", label: "In progress" });
    expect(resolveStatus("ready", {})).toEqual({ slug: "ready", label: "Ready" });
  });

  it("lets the owner's override win", () => {
    expect(resolveStatus("wip", { wip: "Building" })).toEqual({ slug: "wip", label: "Building" });
  });

  it("falls back to the default when an override is blank", () => {
    expect(resolveStatus("exploration", { exploration: "   " })?.label).toBe("Exploration");
  });

  it("has default copy for every schema slug", () => {
    for (const slug of LINK_STATUSES) {
      expect(STATUS_LABELS[slug as keyof typeof STATUS_LABELS]).toBeTruthy();
    }
  });
});
