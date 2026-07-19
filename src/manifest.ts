import fs from "node:fs";
import path from "node:path";

import { UsageError } from "./errors.js";
import { readJson } from "./files.js";
import type {
  ExternalSystem,
  LoadedWorkspace,
  RepositoryConfig,
  WorkspaceManifest,
  WorkspaceProfile,
} from "./types.js";
import { assertRelativePath, assertSlug } from "./util.js";

export const MANIFEST_NAME = "braingraph.json";

const PROFILES: readonly WorkspaceProfile[] = ["knowledge", "software"];
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
  const { name, slug, knowledgeDirectory, profiles } = options;
  return {
    $schema: "./schemas/braingraph-workspace.schema.json",
    schemaVersion: 1,
    workspace: {
      name,
      slug,
      profiles,
    },
    knowledge: {
      directory: knowledgeDirectory,
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
  if (manifest.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
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
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    errors.push("workspace.name is required");
  }
  validateSlug(value.slug, "workspace.slug", errors);
  if (!Array.isArray(value.profiles) || !value.profiles.includes("knowledge")) {
    errors.push("workspace.profiles must include knowledge");
  } else if (!value.profiles.every(isWorkspaceProfile)) {
    errors.push("workspace.profiles contains an unsupported profile");
  }
}

function validateKnowledge(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("knowledge is required");
    return;
  }
  validateRelativePath(value.directory, "knowledge.directory", errors);

  const obsidian = value.obsidian;
  if (
    !isRecord(obsidian) ||
    obsidian.enabled !== true ||
    typeof obsidian.vaultName !== "string" ||
    obsidian.vaultName.length === 0
  ) {
    errors.push("knowledge.obsidian must define enabled=true and vaultName");
  }

  const qmd = value.qmd;
  if (
    !isRecord(qmd) ||
    qmd.enabled !== true ||
    typeof qmd.collection !== "string" ||
    qmd.collection.length === 0
  ) {
    errors.push("knowledge.qmd must define enabled=true and collection");
  }
  if (
    !isRecord(qmd) ||
    !Array.isArray(qmd.include) ||
    qmd.include.length === 0 ||
    !qmd.include.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    errors.push("knowledge.qmd.include must contain indexed paths");
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
  if (
    !Array.isArray(value.roles) ||
    value.roles.length === 0 ||
    !value.roles.every((role) => includes(SYSTEM_ROLES, role))
  ) {
    errors.push(`external system ${label} has invalid roles`);
  }
  if (
    !Array.isArray(value.owns) ||
    value.owns.length === 0 ||
    !value.owns.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    errors.push(`external system ${label} requires owns`);
  }
}

function validateExternalSystemAccess(
  access: unknown,
  label: string,
  errors: string[],
): void {
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
