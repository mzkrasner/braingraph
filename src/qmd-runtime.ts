import fs from "node:fs";
import path from "node:path";

import { parseDocument } from "yaml";

import { runBounded } from "./bounded-process.js";
import { UsageError } from "./errors.js";
import { writeJsonAtomic } from "./files.js";
import { loadWorkspace } from "./manifest.js";
import type { ProcessOptions, ProcessResult } from "./types.js";
import { assertCanonicalPathInside, sameCanonicalPath } from "./util.js";

export const QMD_TIMEOUT_MS = 600_000;
export const QMD_PROBE_TIMEOUT_MS = 30_000;
const STATE_FILES = [
  "index.yml",
  "index.yaml",
  "index.sqlite",
  "index.sqlite-wal",
  "index.sqlite-shm",
  "index.sqlite-journal",
  "operation.lock",
  "last-operation.json",
] as const;

/** Rejects process-wide index selectors instead of silently targeting another brain. */
export function qmdEnvironment(workspaceRoot: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const [key, value] of Object.entries(environment)) {
    if (
      ["INDEX_PATH", "QMD_CONFIG_DIR", "QMD_SKILLS_DIR"].includes(
        key.toUpperCase(),
      ) &&
      value
    ) {
      throw new UsageError(
        `unset ${key} before workspace-local QMD operations; external index overrides and skill source overrides are not allowed`,
      );
    }
    if (key.toUpperCase() === "PWD") Reflect.deleteProperty(environment, key);
  }
  environment.PWD = fs.realpathSync(workspaceRoot);
  return environment;
}

/** Verifies the exact local state paths, including SQLite sidecars, before invoking QMD. */
export function assertQmdDestinations(
  workspaceRoot: string,
  includeSkill = false,
): void {
  const state = path.join(workspaceRoot, ".qmd");
  assertStatePath(workspaceRoot, state, true);
  for (const name of STATE_FILES)
    assertStatePath(workspaceRoot, path.join(state, name), false);
  if (includeSkill) {
    assertCanonicalPathInside(
      workspaceRoot,
      path.join(workspaceRoot, ".agents", "skills", "qmd", "SKILL.md"),
      "QMD skill destination",
    );
  }
}

function assertStatePath(
  root: string,
  candidate: string,
  directory: boolean,
): void {
  assertCanonicalPathInside(root, candidate, "QMD state destination");
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(candidate);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;
    throw error;
  }
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (!directory && stat.nlink > 1)
  ) {
    throw new UsageError(
      `QMD state must be an unlinked ${directory ? "directory" : "file"}: ${candidate}`,
    );
  }
}

/** Returns only a configuration located directly under the selected workspace. */
export function localQmdConfig(workspaceRoot: string): string | undefined {
  assertQmdDestinations(workspaceRoot);
  const configurations = ["index.yml", "index.yaml"]
    .map((name) => path.join(workspaceRoot, ".qmd", name))
    .filter((candidate) => fs.existsSync(candidate));
  if (configurations.length > 1)
    throw new UsageError(
      "both .qmd/index.yml and index.yaml exist; resolve the ambiguous local configuration first",
    );
  return configurations[0];
}

/** Fails closed rather than allowing QMD's ancestor or global index discovery. */
export function requireLocalQmdConfig(workspaceRoot: string): string {
  const config = localQmdConfig(workspaceRoot);
  if (config === undefined) {
    throw new UsageError(
      "workspace-local QMD index is not configured; run braingraph qmd configure first (QMD init must create the target .qmd configuration)",
    );
  }
  return config;
}

/** Checks the local configuration before QMD can update every collection or execute update hooks. */
export function assertQmdConfig(workspaceRoot: string): void {
  const workspace = loadWorkspace(workspaceRoot);
  const expected = workspace.manifest.knowledge.qmd;
  const vault = path.join(
    workspaceRoot,
    workspace.manifest.knowledge.directory,
  );
  assertCanonicalPathInside(workspaceRoot, vault, "QMD collection path");
  const file = localQmdConfig(workspaceRoot);
  if (file === undefined) return;
  const document = parseDocument(fs.readFileSync(file, "utf8"), {
    uniqueKeys: true,
    stringKeys: true,
  });
  if (document.errors.length > 0 || document.warnings.length > 0)
    throw new UsageError(
      "QMD local configuration contains invalid or unsupported YAML",
    );
  let config: unknown;
  try {
    config = document.toJS({ mapAsMap: true, maxAliasCount: 0 }) as unknown;
  } catch {
    throw new UsageError("QMD local configuration aliases are not supported");
  }
  if (!(config instanceof Map))
    throw new UsageError("QMD local configuration must be a mapping");
  const allowed = [
    "version",
    "collections",
    "models",
    "global_context",
    "editor_uri",
    "editor_uri_template",
  ];
  for (const key of config.keys()) {
    if (typeof key !== "string" || !allowed.includes(key))
      throw new UsageError(
        "QMD local configuration contains an unsupported top-level setting; inspect it before use",
      );
  }
  const collections: unknown = config.get("collections");
  if (collections === undefined) return;
  if (!(collections instanceof Map))
    throw new UsageError("QMD collections must be a mapping");
  for (const [name, definition] of collections) {
    if (name !== expected.collection)
      throw new UsageError(
        "QMD local index contains another collection; use one isolated index per brain before refreshing",
      );
    assertCollectionDefinition(
      definition,
      vault,
      `{${expected.include.join(",")}}`,
    );
  }
}

function assertCollectionDefinition(
  definition: unknown,
  vault: string,
  mask: string,
): void {
  if (!(definition instanceof Map))
    throw new UsageError("QMD collection definition must be a mapping");
  const collectionPath: unknown = definition.get("path");
  const pattern: unknown = definition.get("pattern");
  if (
    typeof collectionPath !== "string" ||
    !sameCanonicalPath(collectionPath, vault) ||
    pattern !== mask
  )
    throw new UsageError(
      "QMD collection has a different path or mask from the workspace manifest",
    );
  if (definition.has("update"))
    throw new UsageError(
      "QMD update hooks are not executed by Braingraph; move separately authorized source updates into their own workflow",
    );
}

/** Runs one QMD operation with a checked workspace, normalized PWD, and bounded lifetime. */
export async function runLocalQmd(
  workspaceRoot: string,
  args: readonly string[],
  options: ProcessOptions & {
    timeoutMs?: number;
    allowUnconfigured?: boolean;
  } = {},
): Promise<ProcessResult> {
  assertQmdDestinations(workspaceRoot, args[0] === "skill");
  if (!options.allowUnconfigured) requireLocalQmdConfig(workspaceRoot);
  assertQmdConfig(workspaceRoot);
  return await runBounded("qmd", args, {
    ...options,
    cwd: fs.realpathSync(workspaceRoot),
    env: qmdEnvironment(workspaceRoot),
    timeoutMs: options.timeoutMs ?? QMD_TIMEOUT_MS,
  });
}

/** Serializes mutating QMD work per brain; abrupt termination leaves a reviewable stale lock. */
export async function withQmdLock(
  workspaceRoot: string,
  operation: "configure" | "refresh",
  action: () => Promise<void>,
): Promise<void> {
  assertQmdDestinations(workspaceRoot);
  const directory = path.join(workspaceRoot, ".qmd");
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, "operation.lock");
  const startedAt = new Date().toISOString();
  let descriptor: number;
  try {
    descriptor = fs.openSync(lock, "wx", 0o600);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new UsageError(
        `QMD operation already locked: ${lock}; inspect its PID and stop any surviving QMD process before removing a stale lock`,
      );
    }
    throw error;
  }
  let status = "failed";
  const ownedLock = fs.fstatSync(descriptor);
  try {
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify({ pid: process.pid, startedAt, operation })}\n`,
    );
    await action();
    status = "succeeded";
  } finally {
    fs.closeSync(descriptor);
    assertQmdDestinations(workspaceRoot);
    assertOwnedLock(lock, ownedLock);
    try {
      writeJsonAtomic(
        path.join(directory, "last-operation.json"),
        {
          operation,
          startedAt,
          finishedAt: new Date().toISOString(),
          status,
        },
        workspaceRoot,
      );
    } finally {
      fs.unlinkSync(lock);
    }
  }
}

function assertOwnedLock(lock: string, owned: fs.Stats): void {
  const current = fs.statSync(lock, { throwIfNoEntry: false });
  if (current?.dev !== owned.dev || current.ino !== owned.ino) {
    throw new UsageError(
      `QMD lock changed during the operation; refusing to remove another owner's lock: ${lock}`,
    );
  }
}
