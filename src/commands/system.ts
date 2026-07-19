import path from "node:path";

import {
  booleanOption,
  listOption,
  parseArgs,
  rejectUnknownOptions,
  stringOption,
} from "../args.js";
import { UsageError } from "../errors.js";
import { ActionPlan } from "../files.js";
import { loadWorkspace, validateManifest } from "../manifest.js";
import type {
  CommandContext,
  ExternalCapture,
  ExternalFreshness,
  ExternalReadAccess,
  ExternalSystem,
  ExternalSystemRole,
  ExternalSystemStatus,
  ExternalWriteAccess,
  OptionMap,
  Sensitivity,
} from "../types.js";
import { assertSlug, sameJson, unique } from "../util.js";

const ALLOWED = {
  status: ["active", "planned", "inactive"],
  role: [
    "source",
    "intake",
    "execution",
    "communication",
    "reference",
    "archive",
  ],
  read: ["none", "manual", "connector"],
  write: ["prohibited", "human-approval", "delegated"],
  freshness: ["verify-live", "revision-tracked", "snapshot", "not-applicable"],
  capture: ["link", "summarize", "synchronize", "copy", "exclude"],
  sensitivity: ["public", "private", "confidential", "regulated"],
} as const;

const WRITE_SCOPE_OPTION = "write-scope";

const SYSTEM_OPTIONS = [
  "name",
  "status",
  "url",
  "role",
  "owns",
  "identifier",
  "read",
  "write",
  WRITE_SCOPE_OPTION,
  "freshness",
  "capture",
  "sensitivity",
  "fallback",
  "notes",
  "workspace",
  "dry-run",
  "help",
] as const;

const CONTROL_OPTIONS = new Set(["workspace", "dry-run", "help"]);

export const SYSTEM_HELP = `Usage:
  braingraph system add <id> --name <name> --role <role> --owns <description> --identifier <identity> --fallback <behavior> [options]
  braingraph system update <id> [options]

Options:
  --name <name>
  --status <status>          active | planned | inactive (default: active)
  --url <url>                Use --url= to clear during update
  --role <role>              source | intake | execution | communication | reference | archive;
                             repeat or comma-separate values
  --owns <description>       Repeat or comma-separate values
  --identifier <identity>    Stable record ID or URL rule; repeat as needed
  --read <mode>              none | manual | connector (default: manual)
  --write <mode>             prohibited | human-approval | delegated (default: human-approval)
  --write-scope <scope>      Required only when write mode is delegated
  --freshness <mode>         verify-live | revision-tracked | snapshot | not-applicable
  --capture <mode>           link | summarize | synchronize | copy | exclude
  --sensitivity <level>      public | private | confidential | regulated
  --fallback <behavior>      What to do when access fails or evidence conflicts
  --notes <text>             Capture exceptions; use --notes= to clear during update
  --workspace <directory>
  --dry-run

Update preserves omitted values. Mark a retired integration inactive instead of
deleting its provenance contract.`;

/** Registers a tool-neutral external-system authority and access contract. */
export function systemAddCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseSystemArguments(tokens, context);
  if (booleanOption(options, "help")) return 0;
  const id = systemId(positionals, "add");
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const system = buildSystem(id, options);
  const existing = workspace.manifest.externalSystems.find(
    (entry) => entry.id === id,
  );
  if (existing !== undefined) {
    if (!sameJson(existing, system)) {
      throw new UsageError(
        `external system ${id} already exists with different configuration; use system update`,
      );
    }
    (context.output ?? process.stdout).write(
      `External system unchanged: ${id}\n`,
    );
    return 0;
  }

  const updated = structuredClone(workspace.manifest);
  updated.externalSystems.push(system);
  updated.externalSystems.sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  writeValidatedManifestUpdate(
    workspace.file,
    updated,
    options,
    context,
    "register external system",
  );
  return 0;
}

/** Updates an existing external-system contract while preserving omitted values. */
export function systemUpdateCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseSystemArguments(tokens, context);
  if (booleanOption(options, "help")) return 0;
  const id = systemId(positionals, "update");
  requireUpdateField(options);
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const existing = workspace.manifest.externalSystems.find(
    (entry) => entry.id === id,
  );
  if (existing === undefined) {
    throw new UsageError(`unknown external system: ${id}`);
  }
  const system = buildSystem(id, options, existing);
  if (sameJson(existing, system)) {
    (context.output ?? process.stdout).write(
      `External system unchanged: ${id}\n`,
    );
    return 0;
  }

  const updated = structuredClone(workspace.manifest);
  updated.externalSystems = updated.externalSystems.map((entry) =>
    entry.id === id ? system : entry,
  );
  writeValidatedManifestUpdate(
    workspace.file,
    updated,
    options,
    context,
    "update external system",
  );
  return 0;
}

function parseSystemArguments(
  tokens: readonly string[],
  context: CommandContext,
): ReturnType<typeof parseArgs> {
  const parsed = parseArgs(tokens);
  rejectUnknownOptions(parsed.options, SYSTEM_OPTIONS);
  if (booleanOption(parsed.options, "help")) {
    (context.output ?? process.stdout).write(`${SYSTEM_HELP}\n`);
  }
  return parsed;
}

function systemId(positionals: readonly string[], operation: string): string {
  if (positionals.length !== 1) {
    throw new UsageError(`system ${operation} requires one id`);
  }
  return assertSlug(positionals[0], "external system id");
}

function buildSystem(
  id: string,
  options: OptionMap,
  existing?: ExternalSystem,
): ExternalSystem {
  const name = optionOrExisting(options, "name", existing?.name);
  const roles = listOrExisting<ExternalSystemRole>(
    options,
    "role",
    existing?.roles,
    ALLOWED.role,
  );
  const owns = listOrExisting(options, "owns", existing?.owns);
  const identifiers = listOrExisting(
    options,
    "identifier",
    existing?.identifiers,
  );
  const fallback = optionOrExisting(options, "fallback", existing?.fallback);
  const url = optionalOption(options, "url", existing?.url);
  const requestedWriteScope = optionalOption(
    options,
    WRITE_SCOPE_OPTION,
    existing?.writeScope,
  );
  const notes = optionalOption(options, "notes", existing?.notes);
  const write = allowedOption<ExternalWriteAccess>(
    options,
    "write",
    ALLOWED.write,
    existing?.access.write ?? "human-approval",
  );
  const writeScope = write === "delegated" ? requestedWriteScope : undefined;
  if (write === "delegated" && writeScope === undefined) {
    throw new UsageError("--write-scope is required when --write=delegated");
  }
  if (
    write !== "delegated" &&
    options.has(WRITE_SCOPE_OPTION) &&
    requestedWriteScope !== undefined
  ) {
    throw new UsageError("--write-scope is only valid when --write=delegated");
  }
  return {
    id,
    name,
    status: allowedOption<ExternalSystemStatus>(
      options,
      "status",
      ALLOWED.status,
      existing?.status ?? "active",
    ),
    ...(url === undefined ? {} : { url }),
    roles,
    owns,
    identifiers,
    access: {
      read: allowedOption<ExternalReadAccess>(
        options,
        "read",
        ALLOWED.read,
        existing?.access.read ?? "manual",
      ),
      write,
    },
    ...(writeScope === undefined ? {} : { writeScope }),
    freshness: allowedOption<ExternalFreshness>(
      options,
      "freshness",
      ALLOWED.freshness,
      existing?.freshness ?? "verify-live",
    ),
    capture: allowedOption<ExternalCapture>(
      options,
      "capture",
      ALLOWED.capture,
      existing?.capture ?? "summarize",
    ),
    sensitivity: allowedOption<Sensitivity>(
      options,
      "sensitivity",
      ALLOWED.sensitivity,
      existing?.sensitivity ?? "private",
    ),
    fallback,
    ...(notes === undefined ? {} : { notes }),
  };
}

function writeValidatedManifestUpdate(
  file: string,
  manifest: unknown,
  options: OptionMap,
  context: CommandContext,
  label: string,
): void {
  const errors = validateManifest(manifest);
  if (errors.length > 0) throw new UsageError(errors.join("; "));
  const plan = new ActionPlan({
    root: path.dirname(file),
    dryRun: booleanOption(options, "dry-run"),
    output: context.output ?? process.stdout,
  });
  plan.writeJson(file, manifest, label);
}

function requireUpdateField(options: OptionMap): void {
  const hasUpdate = [...options.keys()].some(
    (key) => !CONTROL_OPTIONS.has(key),
  );
  if (!hasUpdate) {
    throw new UsageError("system update requires at least one field option");
  }
}

function optionOrExisting(
  options: OptionMap,
  key: string,
  existing: string | undefined,
): string {
  const value = stringOption(options, key) ?? existing;
  if (value === undefined || value.trim().length === 0) {
    throw new UsageError(`--${key} is required`);
  }
  return value;
}

function optionalOption(
  options: OptionMap,
  key: string,
  existing: string | undefined,
): string | undefined {
  if (!options.has(key)) return existing;
  const value = stringOption(options, key);
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

function listOrExisting<T extends string = string>(
  options: OptionMap,
  key: string,
  existing: readonly T[] | undefined,
  allowed?: readonly T[],
): T[] {
  if (!options.has(key)) {
    if (existing === undefined || existing.length === 0) {
      throw new UsageError(`--${key} is required`);
    }
    return [...existing];
  }
  const values = unique(listOption(options, key));
  if (values.length === 0) throw new UsageError(`--${key} is required`);
  if (allowed !== undefined) validateAllowedList(values, allowed, key);
  return values as T[];
}

function allowedOption<T extends string>(
  options: OptionMap,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = stringOption(options, key, fallback);
  if (!includes(allowed, value)) {
    throw new UsageError(`--${key} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function validateAllowedList<T extends string>(
  values: string[],
  allowed: readonly T[],
  key: string,
): asserts values is T[] {
  const invalid = values.filter((value) => !includes(allowed, value));
  if (invalid.length > 0) {
    throw new UsageError(
      `--${key} contains unsupported values: ${invalid.join(", ")}`,
    );
  }
}

function includes<const T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return values.includes(value);
}
