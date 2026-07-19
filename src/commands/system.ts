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
  ExternalWriteAccess,
  OptionMap,
  Sensitivity,
} from "../types.js";
import { assertSlug, sameJson, unique } from "../util.js";

const ALLOWED = {
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

export const SYSTEM_HELP = `Usage:
  braingraph system add <id> --name <name> --role <role> --owns <description> [options]

Options:
  --url <url>
  --role <role>              Repeat or comma-separate values
  --owns <description>       Repeat or comma-separate values
  --read <mode>              none | manual | connector (default: manual)
  --write <mode>             prohibited | human-approval | delegated (default: human-approval)
  --freshness <mode>         verify-live | revision-tracked | snapshot | not-applicable
  --capture <mode>           link | summarize | synchronize | copy | exclude
  --sensitivity <level>      public | private | confidential | regulated
  --notes <text>
  --workspace <directory>
  --dry-run`;

/** Registers a tool-neutral external-system authority and access contract. */
export function systemAddCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    "name",
    "url",
    "role",
    "owns",
    "read",
    "write",
    "freshness",
    "capture",
    "sensitivity",
    "notes",
    "workspace",
    "dry-run",
    "help",
  ]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${SYSTEM_HELP}\n`);
    return 0;
  }
  if (positionals.length !== 1)
    throw new UsageError("system add requires one id");
  const id = assertSlug(positionals[0], "external system id");
  const name = requiredOption(options, "name");
  const roles = unique(listOption(options, "role"));
  const owns = unique(listOption(options, "owns"));
  if (roles.length === 0) throw new UsageError("--role is required");
  if (owns.length === 0) throw new UsageError("--owns is required");
  validateAllowedList(roles, ALLOWED.role, "role");

  const url = stringOption(options, "url");
  const notes = stringOption(options, "notes");
  const system: ExternalSystem = {
    id,
    name,
    ...(url === undefined ? {} : { url }),
    roles,
    owns,
    access: {
      read: allowedOption<ExternalReadAccess>(
        options,
        "read",
        ALLOWED.read,
        "manual",
      ),
      write: allowedOption<ExternalWriteAccess>(
        options,
        "write",
        ALLOWED.write,
        "human-approval",
      ),
    },
    freshness: allowedOption<ExternalFreshness>(
      options,
      "freshness",
      ALLOWED.freshness,
      "verify-live",
    ),
    capture: allowedOption<ExternalCapture>(
      options,
      "capture",
      ALLOWED.capture,
      "summarize",
    ),
    sensitivity: allowedOption<Sensitivity>(
      options,
      "sensitivity",
      ALLOWED.sensitivity,
      "private",
    ),
    ...(notes === undefined ? {} : { notes }),
  };

  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const existing = workspace.manifest.externalSystems.find(
    (entry) => entry.id === id,
  );
  if (existing) {
    if (!sameJson(existing, system))
      throw new UsageError(
        `external system ${id} already exists with different configuration`,
      );
    output.write(`External system unchanged: ${id}\n`);
    return 0;
  }

  const updated = structuredClone(workspace.manifest);
  updated.externalSystems.push(system);
  updated.externalSystems.sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const errors = validateManifest(updated);
  if (errors.length) throw new UsageError(errors.join("; "));
  const plan = new ActionPlan({
    dryRun: booleanOption(options, "dry-run"),
    output,
  });
  plan.writeJson(workspace.file, updated, "register external system");
  return 0;
}

function requiredOption(options: OptionMap, key: string): string {
  const value = stringOption(options, key);
  if (!value) throw new UsageError(`--${key} is required`);
  return value;
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
  if (invalid.length)
    throw new UsageError(
      `--${key} contains unsupported values: ${invalid.join(", ")}`,
    );
}

function includes<const T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return values.includes(value);
}
