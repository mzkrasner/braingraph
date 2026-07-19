import fs from "node:fs";
import path from "node:path";

import { UsageError } from "./errors.js";
import { readJson } from "./files.js";
import type { LocalWorkspaceState } from "./types.js";
import { assertSlug } from "./util.js";

export const LOCAL_STATE_NAME = "braingraph.local.json";

/** Loads optional machine-local workspace state without making it canonical. */
export function loadLocalState(root: string): LocalWorkspaceState {
  const file = path.join(root, LOCAL_STATE_NAME);
  if (!fs.existsSync(file)) return { schemaVersion: 1, attachments: {} };
  const candidate = readJson(file);
  const errors = validateLocalState(candidate);
  if (errors.length > 0) {
    throw new UsageError(`invalid ${LOCAL_STATE_NAME}: ${errors.join("; ")}`);
  }
  return candidate as LocalWorkspaceState;
}

/** Validates machine-local attachment mappings. */
export function validateLocalState(candidate: unknown): string[] {
  if (!isRecord(candidate)) return ["root must be an object"];
  const errors: string[] = [];
  if (candidate.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!isRecord(candidate.attachments)) {
    errors.push("attachments must be an object");
    return errors;
  }
  for (const [id, value] of Object.entries(candidate.attachments)) {
    validateAttachment(id, value, errors);
  }
  return errors;
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
