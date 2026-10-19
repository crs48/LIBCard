import { z } from "zod";
import Ajv from "ajv";
import semver from "semver";

export const LAYOUT_API = 1;
export const designId = z.string().max(129).regex(/^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/, "use author/name (lowercase letters, digits, hyphens)");
export const packagePath = z.string().max(240).regex(/^(?:\.\/)?[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/)
  .refine((p) => !p.replace(/^\.\//, "").split("/").some((s) => !s || s === "." || s === ".." || s.startsWith(".")), "package paths must stay inside the package and cannot contain hidden files");
const httpUrl = z.string().url().refine((s) => /^https?:\/\//.test(s), "use an http(s) URL");
const range = z.string().refine((s) => !!semver.validRange(s), "invalid semver range");
const builtinLayout = z.enum(["classic", "editorial"]);
export const designManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: designId,
  name: z.string().min(1).max(100),
  version: z.string().refine((s) => !!semver.valid(s), "invalid version"),
  description: z.string().max(500).default(""),
  author: z.string().min(1),
  authorUrl: httpUrl.optional(),
  source: httpUrl.optional(),
  license: z.string().min(1),
  compatibility: z.object({ layoutApi: z.literal(1), astro: range, libcard: range.default(">=0.2.0 <1") }).strict(),
  layout: z.union([
    z.object({ use: builtinLayout }).strict(),
    z.object({ entry: packagePath.refine((p) => p.endsWith(".astro"), "entry must be an Astro component"), optionsSchema: packagePath.optional() }).strict(),
  ]),
  appearance: z.union([
    z.object({ use: z.string().regex(/^[a-z0-9-]+$/) }).strict(),
    z.object({ file: packagePath }).strict(),
  ]).optional(),
  defaults: z.record(z.unknown()).default({}),
  capabilities: z.object({
    blockFallback: z.literal("core"), clientJavaScript: z.boolean(), remoteAssets: z.boolean(),
  }).strict(),
  files: z.array(packagePath).min(1).max(500),
  previews: z.object({ desktop: packagePath, mobile: packagePath }).strict().optional(),
}).strict();

export const designCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  designs: z.array(z.object({
    id: designId, name: z.string().min(1), description: z.string(), author: z.string().min(1), license: z.string().min(1),
    version: z.string().refine((s) => !!semver.valid(s)), source: httpUrl,
    ref: z.string().regex(/^(?:v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?|[a-f0-9]{40})$/),
    integrity: z.string().regex(/^[a-f0-9]{64}$/),
    compatibility: designManifestSchema.shape.compatibility,
    capabilities: designManifestSchema.shape.capabilities,
    previews: designManifestSchema.shape.previews.unwrap(),
  }).strict()),
}).strict().refine((c) => new Set(c.designs.map((d) => d.id)).size === c.designs.length, "duplicate catalog IDs");

export const emptyOptions = { type: "object", properties: {}, additionalProperties: false };
export const editorialOptions = {
  type: "object", additionalProperties: false,
  properties: { density: { type: "string", enum: ["compact", "comfortable"] }, mediaTone: { type: "string", enum: ["original", "grayscale"] } },
};
/** @typedef {{ id: string, name?: string, layout: string, theme: string, defaults: Record<string, unknown>, optionsSchema: object, builtin?: boolean }} DesignDefinition */
/** @type {DesignDefinition[]} */
export const builtinDesigns = [
  { id: "classic", name: "Classic", layout: "classic", theme: "default", defaults: {}, optionsSchema: emptyOptions, builtin: true },
  { id: "personal-home", name: "Personal home", layout: "editorial", theme: "monochrome", defaults: { density: "compact", mediaTone: "grayscale" }, optionsSchema: editorialOptions, builtin: true },
];
export const builtinLayouts = {
  classic: { defaults: {}, optionsSchema: emptyOptions },
  editorial: { defaults: { density: "comfortable", mediaTone: "original" }, optionsSchema: editorialOptions },
};

export function assertCompatibility(manifest, versions) {
  for (const key of ["astro", "libcard"]) {
    if (!semver.satisfies(versions[key], manifest.compatibility[key])) {
      throw new Error(`${manifest.id} requires ${key} ${manifest.compatibility[key]}; installed ${versions[key]}. Select a compatible release.`);
    }
  }
}

/** JSON Schema draft-07; no fetching, defaults injection, coercion, or custom code. */
const optionValidators = new WeakMap();
export function validateOptions(schema, value, label) {
  if (schema?.type !== "object" || schema?.additionalProperties !== false) throw new Error(`${label}: options schema must be an object with additionalProperties: false`);
  let compiled = optionValidators.get(schema);
  if (!compiled) {
    const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
    compiled = { ajv, validate: ajv.compile(schema) }; optionValidators.set(schema, compiled);
  }
  const { ajv, validate } = compiled;
  if (!validate(value)) throw new Error(`${label}: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  return value;
}

/** @param {any} config @param {DesignDefinition[]} catalog */
export function resolveDesign(config, catalog = builtinDesigns) {
  const selected = catalog.find((d) => d.id === (config.design ?? "classic"));
  if (!selected) throw new Error(`Unknown design "${config.design}". Install it with pnpm run design:add, or choose ${catalog.map((d) => d.id).join(", ")}.`);
  const layout = config.layout ?? selected.layout;
  const definition = builtinLayouts[layout] ?? catalog.find((d) => d.id === layout && d.layout === layout);
  if (!definition) throw new Error(`Unknown layout "${layout}". Only built-in layouts and installed Astro layouts can be selected.`);
  // Validate even dormant option groups, so typos are not silently saved.
  for (const [id, options] of Object.entries(config.layoutOptions ?? {})) {
    const target = builtinLayouts[id] ?? catalog.find((d) => d.layout === id && d.id === id);
    if (!target) throw new Error(`Unknown layoutOptions key "${id}".`);
    validateOptions(target.optionsSchema, { ...target.defaults, ...options }, `layoutOptions.${id}`);
  }
  const options = { ...definition.defaults, ...(layout === selected.layout ? selected.defaults : {}), ...config.layoutOptions?.[layout] };
  validateOptions(definition.optionsSchema, options, `layoutOptions.${layout}`);
  return { layout, theme: config.theme ?? selected.theme ?? "default", options };
}
