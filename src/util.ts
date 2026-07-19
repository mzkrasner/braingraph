import path from "node:path";

import { UsageError } from "./errors.js";

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
