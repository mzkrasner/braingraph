import fs from "node:fs";
import path from "node:path";

import { UsageError } from "./errors.js";
import { readJson } from "./files.js";
import type {
  ExternalSystem,
  LoadedWorkspace,
  MaintenanceMode,
  RepositoryConfig,
  Sensitivity,
  WorkspaceManifest,
  WorkspaceProfile,
  WorkspaceScope,
} from "./types.js";
import { assertRelativePath, assertSlug } from "./util.js";

export const MANIFEST_NAME = "braingraph.json";
export const SCHEMA_VERSION = 1;
export const TEMPLATE_VERSION = 1;

const PROFILES: readonly WorkspaceProfile[] = ["knowledge", "software"];
const WORKSPACE_SCOPES: readonly WorkspaceScope[] = [
  "project",
  "organization",
  "professional-domain",
  "personal-domain",
  "mixed",
];
const MAINTENANCE_MODES: readonly MaintenanceMode[] = [
  "proposal-first",
  "delegated",
];
const SYSTEM_STATUSES = ["active", "planned", "inactive"] as const;
const SYSTEM_ROLES = [
  "source",
  "intake",
  "execution",
  "communication",
  "reference",
  "archive",
] as const;
const READ_ACCESS = ["none", "manual", "connector"] as const;
const WRITE_ACCESS = ["prohibited", "human-approval", "delegated"] as const;
const FRESHNESS = [
  "verify-live",
  "revision-tracked",
  "snapshot",
  "not-applicable",
] as const;
const CAPTURE = [
  "link",
  "summarize",
  "synchronize",
  "copy",
  "exclude",
] as const;
const SENSITIVITY = ["public", "private", "confidential", "regulated"] as const;

interface CreateManifestOptions {
  name: string;
  slug: string;
  description: string;
  scope: WorkspaceScope;
  sensitivity: Sensitivity;
  maintenanceMode: MaintenanceMode;
  delegatedScope?: string;
  knowledgeDirectory: string;
  profiles: WorkspaceProfile[];
}

/**
 * Creates the canonical manifest for a new workspace.
 *
 * @param options - Validated workspace identity and enabled profiles.
 * @returns A version-one Braingraph manifest.
 */
export function createManifest(
  options: CreateManifestOptions,
): WorkspaceManifest {
  const {
    name,
    slug,
    description,
    scope,
    sensitivity,
    maintenanceMode,
    delegatedScope,
    knowledgeDirectory,
    profiles,
  } = options;
  return {
    $schema: "./schemas/braingraph-workspace.schema.json",
    schemaVersion: SCHEMA_VERSION,
    templateVersion: TEMPLATE_VERSION,
    workspace: {
      name,
      slug,
      description,
      scope,
      sensitivity,
      profiles,
    },
    knowledge: {
      directory: knowledgeDirectory,
      maintenance: {
        mode: maintenanceMode,
        ...(delegatedScope === undefined ? {} : { delegatedScope }),
      },
      obsidian: {
        enabled: true,
        vaultName: name,
      },
      qmd: {
        enabled: true,
        collection: `${slug}-brain`,
        include: [
          "projects/**/*.md",
          "domains/**/*.md",
          "wiki/**/*.md",
          "reports/**/*.md",
        ],
      },
    },
    externalSystems: [],
    repositories: {},
  };
}

/**
 * Finds the nearest ancestor containing a Braingraph manifest.
 *
 * @param start - File or directory from which to search upward.
 * @returns The workspace root directory.
 */
export function findWorkspace(start = process.cwd()): string {
  let current = path.resolve(start);
  if (fs.existsSync(current) && fs.statSync(current).isFile()) {
    current = path.dirname(current);
  }

  while (path.dirname(current) !== current) {
    const candidate = path.join(current, MANIFEST_NAME);
    if (fs.existsSync(candidate)) {
      return current;
    }
    current = path.dirname(current);
  }
  const rootCandidate = path.join(current, MANIFEST_NAME);
  if (fs.existsSync(rootCandidate)) return current;
  throw new UsageError(`no ${MANIFEST_NAME} found from ${path.resolve(start)}`);
}

/**
 * Loads and validates the workspace containing the supplied path.
 *
 * @param start - File or directory from which to locate the workspace.
 * @returns The validated manifest and its filesystem locations.
 */
export function loadWorkspace(start = process.cwd()): LoadedWorkspace {
  const root = findWorkspace(start);
  const file = path.join(root, MANIFEST_NAME);
  const candidate = readJson(file);
  const errors = validateManifest(candidate);
  if (errors.length > 0) {
    throw new UsageError(`invalid ${MANIFEST_NAME}: ${errors.join("; ")}`);
  }
  return { root, file, manifest: candidate as WorkspaceManifest };
}

/**
 * Checks an untrusted manifest value against Braingraph's runtime contract.
 *
 * @param manifest - Parsed JSON value to inspect.
 * @returns Human-readable validation errors; an empty array means valid.
 */
export function validateManifest(manifest: unknown): string[] {
  if (!isRecord(manifest)) {
    return ["root must be an object"];
  }

  const errors: string[] = [];
  validateRecordKeys(
    manifest,
    [
      "$schema",
      "schemaVersion",
      "templateVersion",
      "workspace",
      "knowledge",
      "externalSystems",
      "repositories",
    ],
    "manifest",
    errors,
  );
  if (typeof manifest.$schema !== "string" || manifest.$schema.length === 0) {
    errors.push("$schema is required");
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    errors.push("schemaVersion must be 1");
  }
  if (
    !Number.isInteger(manifest.templateVersion) ||
    (manifest.templateVersion as number) < 1 ||
    (manifest.templateVersion as number) > TEMPLATE_VERSION
  ) {
    errors.push(
      `templateVersion must be between 1 and ${String(TEMPLATE_VERSION)}`,
    );
  }
  validateWorkspace(manifest.workspace, errors);
  validateKnowledge(manifest.knowledge, errors);

  if (!Array.isArray(manifest.externalSystems)) {
    errors.push("externalSystems must be an array");
  } else {
    validateExternalSystems(manifest.externalSystems, errors);
  }

  if (!isRecord(manifest.repositories)) {
    errors.push("repositories must be an object");
  } else {
    validateRepositories(manifest.repositories, errors);
  }
  return errors;
}

function validateWorkspace(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("workspace is required");
    return;
  }
  validateRecordKeys(
    value,
    ["name", "slug", "description", "scope", "sensitivity", "profiles"],
    "workspace",
    errors,
  );
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    errors.push("workspace.name is required");
  }
  validateSlug(value.slug, "workspace.slug", errors);
  if (
    typeof value.description !== "string" ||
    value.description.trim().length === 0 ||
    /\r|\n/.test(value.description)
  ) {
    errors.push("workspace.description must be one non-empty line");
  }
  if (!includes(WORKSPACE_SCOPES, value.scope)) {
    errors.push("workspace.scope is unsupported");
  }
  if (!includes(SENSITIVITY, value.sensitivity)) {
    errors.push("workspace.sensitivity is unsupported");
  }
  if (!Array.isArray(value.profiles) || !value.profiles.includes("knowledge")) {
    errors.push("workspace.profiles must include knowledge");
  } else if (!value.profiles.every(isWorkspaceProfile)) {
    errors.push("workspace.profiles contains an unsupported profile");
  } else if (!hasUniqueValues(value.profiles)) {
    errors.push("workspace.profiles must be unique");
  }
}

function validateKnowledge(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("knowledge is required");
    return;
  }
  validateRecordKeys(
    value,
    ["directory", "maintenance", "obsidian", "qmd"],
    "knowledge",
    errors,
  );
  validateRelativePath(value.directory, "knowledge.directory", errors);
  validateMaintenance(value.maintenance, errors);

  const obsidian = value.obsidian;
  if (
    !isRecord(obsidian) ||
    obsidian.enabled !== true ||
    typeof obsidian.vaultName !== "string" ||
    obsidian.vaultName.length === 0
  ) {
    errors.push("knowledge.obsidian must define enabled=true and vaultName");
  } else {
    validateRecordKeys(
      obsidian,
      ["enabled", "vaultName"],
      "knowledge.obsidian",
      errors,
    );
  }

  const qmd = value.qmd;
  if (
    !isRecord(qmd) ||
    qmd.enabled !== true ||
    typeof qmd.collection !== "string" ||
    qmd.collection.length === 0
  ) {
    errors.push("knowledge.qmd must define enabled=true and collection");
  } else {
    validateRecordKeys(
      qmd,
      ["enabled", "collection", "include"],
      "knowledge.qmd",
      errors,
    );
  }
  if (
    !isRecord(qmd) ||
    !Array.isArray(qmd.include) ||
    qmd.include.length === 0 ||
    !qmd.include.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    errors.push("knowledge.qmd.include must contain indexed paths");
  } else if (!hasUniqueValues(qmd.include)) {
    errors.push("knowledge.qmd.include must be unique");
  }
}

function validateMaintenance(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("knowledge.maintenance is required");
    return;
  }
  validateRecordKeys(
    value,
    ["mode", "delegatedScope"],
    "knowledge.maintenance",
    errors,
  );
  if (!includes(MAINTENANCE_MODES, value.mode)) {
    errors.push("knowledge.maintenance.mode is unsupported");
  }
  validateOptionalString(
    value.delegatedScope,
    "knowledge.maintenance.delegatedScope",
    errors,
  );
  if (
    value.mode === "delegated" &&
    (typeof value.delegatedScope !== "string" ||
      value.delegatedScope.trim().length === 0)
  ) {
    errors.push("delegated knowledge maintenance requires delegatedScope");
  }
  if (value.mode === "proposal-first" && value.delegatedScope !== undefined) {
    errors.push("proposal-first knowledge maintenance cannot delegate a scope");
  }
}

function validateExternalSystems(systems: unknown[], errors: string[]): void {
  const ids = new Set<string>();
  for (const value of systems) {
    validateExternalSystem(value, ids, errors);
  }
}

function validateExternalSystem(
  value: unknown,
  ids: Set<string>,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push("externalSystems entries must be objects");
    return;
  }
  validateRecordKeys(
    value,
    [
      "id",
      "name",
      "status",
      "url",
      "roles",
      "owns",
      "identifiers",
      "access",
      "writeScope",
      "freshness",
      "capture",
      "sensitivity",
      "fallback",
      "notes",
    ],
    "external system",
    errors,
  );
  const label = validateExternalSystemId(value.id, ids, errors);
  validateExternalSystemFields(value, label, errors);
  validateExternalSystemAccess(value.access, label, errors);
  validateExternalSystemEnums(value, label, errors);
}

function validateExternalSystemId(
  id: unknown,
  ids: Set<string>,
  errors: string[],
): string {
  validateSlug(id, "external system id", errors);
  if (typeof id !== "string") return "(invalid id)";
  if (ids.has(id)) errors.push(`duplicate external system: ${id}`);
  ids.add(id);
  return id;
}

function validateExternalSystemFields(
  value: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  if (typeof value.name !== "string" || value.name.length === 0) {
    errors.push(`external system ${label} requires a name`);
  }
  if (!includes(SYSTEM_STATUSES, value.status)) {
    errors.push(`external system ${label} has invalid status`);
  }
  validateOptionalString(value.url, `external system ${label} url`, errors);
  if (
    !Array.isArray(value.roles) ||
    value.roles.length === 0 ||
    !value.roles.every((role) => includes(SYSTEM_ROLES, role)) ||
    !hasUniqueValues(value.roles)
  ) {
    errors.push(`external system ${label} has invalid roles`);
  }
  if (
    !Array.isArray(value.owns) ||
    value.owns.length === 0 ||
    !value.owns.every(
      (entry) => typeof entry === "string" && entry.length > 0,
    ) ||
    !hasUniqueValues(value.owns)
  ) {
    errors.push(`external system ${label} requires owns`);
  }
  if (
    !Array.isArray(value.identifiers) ||
    value.identifiers.length === 0 ||
    !value.identifiers.every(
      (entry) => typeof entry === "string" && entry.length > 0,
    ) ||
    !hasUniqueValues(value.identifiers)
  ) {
    errors.push(`external system ${label} requires unique identifiers`);
  }
  if (typeof value.fallback !== "string" || value.fallback.length === 0) {
    errors.push(`external system ${label} requires fallback behavior`);
  }
  validateOptionalString(
    value.writeScope,
    `external system ${label} writeScope`,
    errors,
  );
  validateOptionalString(
    value.notes,
    `external system ${label} notes`,
    errors,
    true,
  );
  if (
    isRecord(value.access) &&
    value.access.write === "delegated" &&
    (typeof value.writeScope !== "string" || value.writeScope.length === 0)
  ) {
    errors.push(`external system ${label} requires delegated writeScope`);
  }
  if (
    isRecord(value.access) &&
    value.access.write !== "delegated" &&
    value.writeScope !== undefined
  ) {
    errors.push(
      `external system ${label} cannot define writeScope without delegated access`,
    );
  }
}

function validateExternalSystemAccess(
  access: unknown,
  label: string,
  errors: string[],
): void {
  if (isRecord(access)) {
    validateRecordKeys(
      access,
      ["read", "write"],
      `external system ${label} access`,
      errors,
    );
  }
  if (!isRecord(access) || !includes(READ_ACCESS, access.read)) {
    errors.push(`external system ${label} has invalid read access`);
  }
  if (!isRecord(access) || !includes(WRITE_ACCESS, access.write)) {
    errors.push(`external system ${label} has invalid write access`);
  }
}

function validateExternalSystemEnums(
  value: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  if (!includes(FRESHNESS, value.freshness)) {
    errors.push(`external system ${label} has invalid freshness`);
  }
  if (!includes(CAPTURE, value.capture)) {
    errors.push(`external system ${label} has invalid capture`);
  }
  if (!includes(SENSITIVITY, value.sensitivity)) {
    errors.push(`external system ${label} has invalid sensitivity`);
  }
}

function validateRepositories(
  repositories: Record<string, unknown>,
  errors: string[],
): void {
  for (const [id, value] of Object.entries(repositories)) {
    validateSlug(id, "repository id", errors);
    if (!isRecord(value)) {
      errors.push(`repository ${id} must be an object`);
      continue;
    }
    validateRecordKeys(
      value,
      [
        "url",
        "path",
        "integrationBranch",
        "productionBranch",
        "stableWorktree",
        "branchPrefix",
      ],
      `repository ${id}`,
      errors,
    );
    validateRelativePath(value.path, `repository ${id} path`, errors);
    if (typeof value.url !== "string" || value.url.length === 0) {
      errors.push(`repository ${id} requires url`);
    }
    if (
      typeof value.integrationBranch !== "string" ||
      value.integrationBranch.length === 0
    ) {
      errors.push(`repository ${id} requires integrationBranch`);
    }
    if (
      value.productionBranch !== null &&
      typeof value.productionBranch !== "string"
    ) {
      errors.push(`repository ${id} has invalid productionBranch`);
    }
    validateSlug(
      value.stableWorktree,
      `repository ${id} stableWorktree`,
      errors,
    );
    if (typeof value.branchPrefix !== "string") {
      errors.push(`repository ${id} requires branchPrefix`);
    }
  }
}

function validateSlug(value: unknown, label: string, errors: string[]): void {
  try {
    assertSlug(typeof value === "string" ? value : undefined, label);
  } catch (error: unknown) {
    errors.push(errorMessage(error));
  }
}

function validateRelativePath(
  value: unknown,
  label: string,
  errors: string[],
): void {
  try {
    assertRelativePath(typeof value === "string" ? value : undefined, label);
  } catch (error: unknown) {
    errors.push(errorMessage(error));
  }
}

function validateOptionalString(
  value: unknown,
  label: string,
  errors: string[],
  allowEmpty = false,
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    errors.push(
      `${label} must be a string${allowEmpty ? "" : " with content"}`,
    );
  }
}

function validateRecordKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  errors: string[],
): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0) {
    errors.push(`${label} contains unsupported fields: ${unknown.join(", ")}`);
  }
}

function hasUniqueValues(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkspaceProfile(value: unknown): value is WorkspaceProfile {
  return includes(PROFILES, value);
}

function includes<const T extends readonly unknown[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return values.includes(value);
}

export type { ExternalSystem, RepositoryConfig };
