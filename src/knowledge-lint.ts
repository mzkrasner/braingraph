import fs from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";

import type { LoadedWorkspace } from "./types.js";
import { assertCanonicalPathInside, resolveInside } from "./util.js";

export interface KnowledgeFinding {
  file: string;
  rule: string;
  status: "warning" | "error";
  detail: string;
}

export interface KnowledgeLintResult {
  workspace: string;
  filesChecked: number;
  findings: KnowledgeFinding[];
  ok: boolean;
}

const DATE_FIELDS = new Set([
  "created",
  "updated",
  "last_reviewed",
  "observed_at",
  "retrieved_at",
  "last_verified",
  "proposed_at",
  "accepted_at",
  "implemented_at",
]);
const EVIDENCE_STATES = new Set([
  "sourced",
  "reported",
  "inferred",
  "mixed",
  "unverified",
]);
const DECISION_STATES = new Set([
  "proposed",
  "accepted",
  "implemented",
  "rejected",
  "superseded",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".obsidian",
  ".trash",
  ".qmd",
  "node_modules",
]);
const MAX_NOTE_BYTES = 2 * 1024 * 1024;

/** Checks local structure and declared metadata without asserting factual truth. */
export function lintKnowledge(workspace: LoadedWorkspace): KnowledgeLintResult {
  const vault = path.join(
    workspace.root,
    workspace.manifest.knowledge.directory,
  );
  assertCanonicalPathInside(workspace.root, vault, "knowledge vault");
  const findings: KnowledgeFinding[] = [];
  const inventory = inventoryFiles(vault, vault, findings);
  const notes = inventory.filter(isGovernedNote);
  for (const relative of notes) {
    lintNote(vault, relative, inventory, findings);
  }
  return {
    workspace: workspace.root,
    filesChecked: notes.length,
    findings,
    ok: !findings.some((finding) => finding.status === "error"),
  };
}

function inventoryFiles(
  vault: string,
  directory: string,
  findings: KnowledgeFinding[],
): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = portableRelative(vault, absolute);
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      findings.push(
        finding(
          relative,
          "filesystem-link",
          "error",
          "symbolic links are not followed; keep each vault self-contained",
        ),
      );
    } else if (entry.isDirectory()) {
      files.push(...inventoryFiles(vault, absolute, findings));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}

function isGovernedNote(relative: string): boolean {
  if (!relative.endsWith(".md")) return false;
  const first = relative.split("/")[0];
  return (
    first !== "raw" &&
    first !== "_templates" &&
    first !== "evals" &&
    path.posix.basename(relative) !== "AGENTS.md" &&
    path.posix.basename(relative) !== "CLAUDE.md"
  );
}

function lintNote(
  vault: string,
  relative: string,
  inventory: readonly string[],
  findings: KnowledgeFinding[],
): void {
  const absolute = path.join(vault, relative);
  if (fs.statSync(absolute).size > MAX_NOTE_BYTES) {
    findings.push(
      finding(
        relative,
        "note-size",
        "error",
        "note exceeds the 2 MiB lint limit; split the note or retain large material in raw intake",
      ),
    );
    return;
  }
  const text = fs.readFileSync(absolute, "utf8").replaceAll("\r\n", "\n");
  const { metadata, body } = readFrontmatter(relative, text, findings);
  if (metadata !== undefined) {
    validateMetadata(vault, relative, metadata, findings);
  }
  for (const match of proseOnly(body).matchAll(/(?<!\\)\[\[([^\]\n]+)\]\]/g)) {
    const target = match[1]?.split(/[|#]/)[0]?.trim();
    if (target) lintWikilink(vault, relative, target, inventory, findings);
  }
}

function readFrontmatter(
  relative: string,
  text: string,
  findings: KnowledgeFinding[],
): { metadata?: Map<unknown, unknown>; body: string } {
  if (!text.startsWith("---\n")) return { body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1 || !/^\n---(?:\n|$)/.test(text.slice(end))) {
    findings.push(
      finding(
        relative,
        "frontmatter",
        "error",
        "frontmatter must end with a standalone --- line",
      ),
    );
    return { body: "" };
  }
  const document = parseDocument(text.slice(4, end), {
    uniqueKeys: true,
    stringKeys: true,
    prettyErrors: false,
  });
  const diagnostics = [...document.errors, ...document.warnings];
  if (diagnostics.length > 0) {
    findings.push(
      finding(
        relative,
        "frontmatter",
        "error",
        diagnostics.map((item) => item.message).join("; "),
      ),
    );
    return { body: text.slice(end + 4) };
  }
  try {
    if (document.contents === null)
      return { metadata: new Map(), body: text.slice(end + 4) };
    const metadata: unknown = document.toJS({
      mapAsMap: true,
      maxAliasCount: 0,
    });
    if (!(metadata instanceof Map))
      throw new TypeError("frontmatter must be a YAML mapping");
    return { metadata, body: text.slice(end + 4) };
  } catch (error: unknown) {
    findings.push(
      finding(relative, "frontmatter", "error", errorMessage(error)),
    );
    return { body: text.slice(end + 4) };
  }
}

function validateMetadata(
  vault: string,
  relative: string,
  metadata: Map<unknown, unknown>,
  findings: KnowledgeFinding[],
): void {
  for (const [key, value] of metadata) {
    if (typeof key !== "string") continue;
    if (DATE_FIELDS.has(key) && !isIsoDate(value)) {
      findings.push(
        finding(
          relative,
          "metadata-date",
          "error",
          `${key} must be an actual ISO date or timestamp; omit unknown dates`,
        ),
      );
    }
  }
  validateEnum(
    relative,
    "evidence_status",
    metadata,
    EVIDENCE_STATES,
    findings,
  );
  if (metadata.get("type") === "decision") {
    validateEnum(relative, "status", metadata, DECISION_STATES, findings, true);
    validateDecisionDates(relative, metadata, findings);
  }
  if (
    metadata.has("last_verified") &&
    !nonemptyText(metadata.get("verification_scope"))
  ) {
    findings.push(
      finding(
        relative,
        "verification-scope",
        "warning",
        "last_verified needs a verification_scope; reading a note does not verify its claims",
      ),
    );
  }
  for (const field of ["verification_scope", "verification_limits"]) {
    if (metadata.has(field) && !nonemptyText(metadata.get(field))) {
      findings.push(
        finding(
          relative,
          "metadata-text",
          "error",
          `${field} must be non-empty text when provided`,
        ),
      );
    }
  }
  validateSourcePaths(vault, relative, metadata, findings);
}

function validateEnum(
  relative: string,
  key: string,
  metadata: Map<unknown, unknown>,
  values: Set<string>,
  findings: KnowledgeFinding[],
  required = false,
): void {
  const value: unknown = metadata.get(key);
  if (!required && value === undefined) return;
  if (typeof value !== "string" || !values.has(value)) {
    findings.push(
      finding(
        relative,
        "metadata-enum",
        "error",
        `${key} must be one of: ${[...values].join(", ")}`,
      ),
    );
  }
}

function validateDecisionDates(
  relative: string,
  metadata: Map<unknown, unknown>,
  findings: KnowledgeFinding[],
): void {
  const status: unknown = metadata.get("status");
  const required =
    status === "implemented"
      ? ["accepted_at", "implemented_at"]
      : status === "accepted"
        ? ["accepted_at"]
        : [];
  for (const key of required) {
    if (!metadata.has(key))
      findings.push(
        finding(
          relative,
          "decision-evidence",
          "warning",
          `${status === "implemented" ? "implemented" : "accepted"} decision is missing ${key}; do not infer an event date`,
        ),
      );
  }
  const ordered = ["proposed_at", "accepted_at", "implemented_at"]
    .map((key) => metadata.get(key))
    .filter(isIsoDate);
  const comparable =
    ordered.every((date) => date.length === 10) ||
    ordered.every(
      (date) => date.length > 10 && /(?:Z|[+-]\d{2}:\d{2})$/.test(date),
    );
  if (
    comparable &&
    ordered.some(
      (date, index) =>
        index > 0 &&
        Date.parse(date) < Date.parse(ordered.at(index - 1) ?? date),
    )
  ) {
    findings.push(
      finding(
        relative,
        "decision-order",
        "error",
        "decision dates must follow proposed → accepted → implemented order",
      ),
    );
  }
}

function validateSourcePaths(
  vault: string,
  relative: string,
  metadata: Map<unknown, unknown>,
  findings: KnowledgeFinding[],
): void {
  const source: unknown = metadata.get("source_path");
  const sources: unknown = metadata.get("source_paths");
  if (sources !== undefined && !Array.isArray(sources)) {
    findings.push(
      finding(
        relative,
        "source-path",
        "error",
        "source_paths must be a list of vault-relative paths",
      ),
    );
  }
  const values: unknown[] = [
    ...(source === undefined ? [] : [source]),
    ...(Array.isArray(sources) ? (sources as unknown[]) : []),
  ];
  for (const value of values) {
    try {
      if (typeof value !== "string" || value.includes(":"))
        throw new TypeError(
          "source paths must be vault-relative; use source_url for remote sources",
        );
      const absolute = resolveInside(vault, value, "source path");
      assertCanonicalPathInside(vault, absolute, "source path");
      if (!fs.statSync(absolute).isFile())
        throw new TypeError("source path must name a regular file");
    } catch (error: unknown) {
      findings.push(
        finding(relative, "source-path", "error", errorMessage(error)),
      );
    }
  }
}

function lintWikilink(
  vault: string,
  relative: string,
  target: string,
  inventory: readonly string[],
  findings: KnowledgeFinding[],
): void {
  try {
    const normalized = target.replaceAll("\\", "/");
    const scopedTarget = normalized.startsWith(".")
      ? path.posix.join(path.posix.dirname(relative), normalized)
      : normalized;
    resolveInside(vault, scopedTarget, "wikilink");
    const names = new Set([normalized, `${normalized}.md`]);
    const localNames = new Set(
      [...names].map((name) =>
        path.posix.normalize(
          path.posix.join(path.posix.dirname(relative), name),
        ),
      ),
    );
    const exact = inventory.filter(
      (name) => names.has(name) || localNames.has(name),
    );
    const matches =
      exact.length > 0 || normalized.includes("/")
        ? exact
        : inventory.filter((name) => names.has(path.posix.basename(name)));
    if (matches.length !== 1) {
      findings.push(
        finding(
          relative,
          "wikilink",
          "warning",
          matches.length === 0
            ? `unresolved wikilink: ${target}`
            : `ambiguous wikilink: ${target}; use a vault-relative path`,
        ),
      );
    }
  } catch (error: unknown) {
    findings.push(finding(relative, "wikilink", "error", errorMessage(error)));
  }
}

function proseOnly(body: string): string {
  let fence: string | undefined;
  return body
    .split("\n")
    .filter((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker !== undefined) {
        if (fence === undefined) fence = marker;
        else if (
          marker.startsWith(fence.charAt(0)) &&
          marker.length >= fence.length
        )
          fence = undefined;
        return false;
      }
      return fence === undefined;
    })
    .join("\n")
    .replace(/`[^`\n]*`/g, "");
}

/** Accepts real ISO dates and Obsidian datetime properties without inventing a timezone. */
export function isIsoDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 29 ||
    // eslint-disable-next-line security/detect-unsafe-regex -- Anchored ISO shape; every repetition and the input length are bounded.
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    )
  )
    return false;
  const day = value.slice(0, 10);
  if (value.length > 10 && Number(value.slice(11, 13)) > 23) return false;
  const parsedDay = Date.parse(`${day}T00:00:00Z`);
  return (
    Number.isFinite(parsedDay) &&
    new Date(parsedDay).toISOString().startsWith(day) &&
    Number.isFinite(Date.parse(value))
  );
}

function nonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function portableRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function finding(
  file: string,
  rule: string,
  status: KnowledgeFinding["status"],
  detail: string,
): KnowledgeFinding {
  return { file, rule, status, detail };
}
