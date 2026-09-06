import fs from "node:fs";
import path from "node:path";

import { UsageError } from "./errors.js";
import { readJson } from "./files.js";
import { isIdentityString, validateSystemIdentity } from "./system-identity.js";
import type { LocalWorkspaceState } from "./types.js";
import { assertCanonicalPathInside, assertSlug } from "./util.js";

export const LOCAL_STATE_NAME = "braingraph.local.json";

/** Loads optional machine-local workspace state without making it canonical. */
export function loadLocalState(root: string): LocalWorkspaceState {
  const file = path.join(root, LOCAL_STATE_NAME);
  assertCanonicalPathInside(root, file, "local workspace state");
  if (!fs.existsSync(file)) return { schemaVersion: 1, attachments: {} };
  const candidate = readJson(file);
  const errors = validateLocalState(candidate);
  if (errors.length > 0) {
    throw new UsageError(`invalid ${LOCAL_STATE_NAME}: ${errors.join("; ")}`);
  }
  return candidate as LocalWorkspaceState;
}

/** Validates machine-local mappings, rejecting undeclared fields such as credentials. */
export function validateLocalState(candidate: unknown): string[] {
  if (!isRecord(candidate)) return ["root must be an object"];
  const errors: string[] = [];
  for (const key of Object.keys(candidate)) {
    if (!["schemaVersion", "attachments", "systemBindings"].includes(key)) {
      errors.push(`unsupported local state field: ${key}`);
    }
  }
  if (candidate.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!isRecord(candidate.attachments)) {
    errors.push("attachments must be an object");
    return errors;
  }
  for (const [id, value] of Object.entries(candidate.attachments)) {
    validateAttachment(id, value, errors);
  }
  if (candidate.systemBindings !== undefined) {
    validateSystemBindings(candidate.systemBindings, errors);
  }
  return errors;
}

function validateSystemBindings(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("systemBindings must be an object");
    return;
  }
  for (const [id, binding] of Object.entries(value)) {
    validateSystemBinding(id, binding, errors);
  }
}

function validateSystemBinding(
  id: string,
  binding: unknown,
  errors: string[],
): void {
  try {
    assertSlug(id, "system binding id");
  } catch (error: unknown) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(binding)) {
    errors.push(`system binding ${id} must be an object`);
    return;
  }
  for (const key of Object.keys(binding)) {
    if (!["connector", "identity", "recordedAt"].includes(key)) {
      errors.push(`system binding ${id} contains unsupported field: ${key}`);
    }
  }
  if (!isIdentityString(binding.connector)) {
    errors.push(
      `system binding ${id} connector must be a non-empty, trimmed, single-line identifier`,
    );
  }
  errors.push(
    ...validateSystemIdentity(
      binding.identity,
      `system binding ${id} identity`,
    ),
  );
  if (!isCanonicalTimestamp(binding.recordedAt)) {
    errors.push(`system binding ${id} recordedAt must be an ISO timestamp`);
  }
}

function isCanonicalTimestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function validateAttachment(
  id: string,
  value: unknown,
  errors: string[],
): void {
  try {
    assertSlug(id, "attachment repository id");
  } catch (error: unknown) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(value)) {
    errors.push(`attachment ${id} must be an object`);
    return;
  }
  const unknown = Object.keys(value).filter(
    (key) => key !== "checkoutPath" && key !== "bridge",
  );
  if (unknown.length > 0) {
    errors.push(
      `attachment ${id} contains unsupported fields: ${unknown.join(", ")}`,
    );
  }
  if (
    typeof value.checkoutPath !== "string" ||
    !path.isAbsolute(value.checkoutPath)
  ) {
    errors.push(`attachment ${id} checkoutPath must be absolute`);
  }
  if (typeof value.bridge !== "boolean") {
    errors.push(`attachment ${id} bridge must be boolean`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
