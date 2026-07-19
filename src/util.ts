import fs from "node:fs";
import path from "node:path";

import { UsageError } from "./errors.js";

const RESERVED_KNOWLEDGE_ROOTS = new Set([
  ".agents",
  ".git",
  ".qmd",
  "AGENTS.md",
  "CLAUDE.md",
  "braingraph.json",
  "braingraph.local.json",
  "repositories",
  "schemas",
]);

/** Converts human-facing text into a stable lowercase slug. */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new UsageError(`cannot derive a slug from: ${value}`);
  return slug;
}

/** Validates and returns a lowercase dash-delimited slug. */
export function assertSlug(
  value: string | undefined,
  label = "identifier",
): string {
  if (value === undefined) {
    throw new UsageError(`${label} is required`);
  }
  if (!isSlug(value)) {
    throw new UsageError(
      `${label} must use lowercase letters, numbers, and single dashes`,
    );
  }
  return value;
}

/** Validates and normalizes a path that must remain relative. */
export function assertRelativePath(
  value: string | undefined,
  label = "path",
): string {
  if (!value || path.isAbsolute(value))
    throw new UsageError(`${label} must be a relative path`);
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new UsageError(`${label} must remain inside the workspace`);
  }
  return normalized;
}

/** Validates a knowledge directory that cannot collide with workspace state. */
export function assertKnowledgeDirectoryPath(value: string): string {
  const normalized = assertRelativePath(value, "knowledge directory");
  const firstSegment = normalized.split(path.sep)[0];
  if (
    normalized === "." ||
    firstSegment === undefined ||
    RESERVED_KNOWLEDGE_ROOTS.has(firstSegment)
  ) {
    throw new UsageError(
      "knowledge directory must be a distinct non-reserved directory inside the workspace",
    );
  }
  return normalized;
}

/** Resolves a relative path while enforcing the supplied root boundary. */
export function resolveInside(
  root: string,
  relative: string,
  label = "path",
): string {
  const normalized = assertRelativePath(relative, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, normalized);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new UsageError(`${label} must remain inside the workspace`);
  }
  return resolved;
}

/**
 * Resolves a destination and rejects filesystem links that escape a root.
 *
 * Missing path components are resolved below their nearest existing ancestor,
 * so this check works before workspace initialization as well as before later
 * mutations. Call it immediately before each write because filesystem state can
 * change between planning and execution.
 */
export function assertCanonicalPathInside(
  root: string,
  candidate: string,
  label = "path",
): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (!isInside(resolvedCandidate, resolvedRoot)) {
    throw new UsageError(`${label} must remain inside the workspace`);
  }

  const canonicalRoot = canonicalizeProspectivePath(resolvedRoot);
  const canonicalCandidate = canonicalizeProspectivePath(resolvedCandidate);
  if (!isInside(canonicalCandidate, canonicalRoot)) {
    throw new UsageError(
      `${label} resolves outside the workspace through a filesystem link`,
    );
  }
  return resolvedCandidate;
}

/** Returns values in first-seen order with duplicates removed. */
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Compares JSON-compatible values by their deterministic serialized shape. */
export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Returns an absolute display path. */
export function formatPath(value: string): string {
  return path.resolve(value);
}

function isSlug(value: string): boolean {
  const segments = value.split("-");
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      Array.from(segment).every(isLowercaseLetterOrNumber),
  );
}

function isLowercaseLetterOrNumber(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

function canonicalizeProspectivePath(candidate: string): string {
  let current = path.resolve(candidate);
  const missing: string[] = [];
  for (;;) {
    try {
      fs.lstatSync(current);
      const canonical = fs.realpathSync(current);
      return path.resolve(canonical, ...missing.reverse());
    } catch (error: unknown) {
      if (!isMissingPathError(error)) {
        throw new UsageError(
          `cannot resolve filesystem boundary for ${candidate}: ${errorMessage(error)}`,
        );
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw new UsageError(
          `cannot resolve filesystem boundary for ${candidate}`,
        );
      }
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
