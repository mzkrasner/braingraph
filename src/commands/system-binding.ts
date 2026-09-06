import path from "node:path";

import {
  booleanOption,
  parseArgs,
  rejectUnknownOptions,
  stringOption,
} from "../args.js";
import { UsageError } from "../errors.js";
import { ActionPlan } from "../files.js";
import {
  loadLocalState,
  LOCAL_STATE_NAME,
  validateLocalState,
} from "../local-state.js";
import { loadWorkspace } from "../manifest.js";
import {
  IDENTITY_FIELDS,
  identityMismatches,
  isIdentityString,
  validateSystemIdentity,
} from "../system-identity.js";
import type {
  CommandContext,
  ExternalSystem,
  ExternalSystemIdentity,
  LocalSystemBinding,
  OptionMap,
} from "../types.js";
import { assertSlug } from "../util.js";

const BINDING_HELP = `Usage:
  braingraph system bind <id> --connector <id> [--account <id>] [--tenant <id>] [--principal <id>] [--workspace <directory>] [--dry-run]
  braingraph system status [id] [--workspace <directory>] [--json]
  braingraph system check <id> --connector <id> [--account <id>] [--tenant <id>] [--principal <id>] [--workspace <directory>]

Declare expected identity first with system add/update --expected-account,
--expected-tenant, or --expected-principal. Supply canonical, non-secret IDs.
Bind records the selected connector and observed identity in braingraph.local.json
for this workspace only; it does not authenticate or contact any provider.
Status reports saved configuration only. Check compares fresh, provider-reported
observations supplied by the caller against both the contract and saved binding.
Never use saved values as fresh observations. Unknown/mismatched identity blocks
read, synchronization, and write. A passing check is not authorization: declared
access, capture policy, delegated scope, and human approval still apply.
These checks guide agents; they cannot enforce authentication in other tools.`;

const OBSERVATION_OPTIONS = [
  "connector",
  ...IDENTITY_FIELDS,
  "workspace",
  "help",
];

interface BindingStatus {
  id: string;
  state: "unbound" | "configured" | "mismatch" | "inactive";
  details: string;
}

/** Saves an explicit non-secret connector mapping in the selected workspace only. */
export function systemBindCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = bindingArguments(
    tokens,
    [...OBSERVATION_OPTIONS, "dry-run"],
    context,
  );
  if (booleanOption(options, "help")) return 0;
  const id = requireId(positionals, "bind");
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const system = requireSystem(workspace.manifest.externalSystems, id);
  const connector = connectorOption(options);
  const identity = observedIdentity(options);
  assertIdentityMatch(system, identity);
  const local = loadLocalState(workspace.root);
  local.systemBindings ??= {};
  Reflect.set(local.systemBindings, id, {
    connector,
    identity,
    recordedAt: new Date().toISOString(),
  });
  const errors = validateLocalState(local);
  if (errors.length > 0) throw new UsageError(errors.join("; "));
  const plan = new ActionPlan({
    root: workspace.root,
    dryRun: booleanOption(options, "dry-run"),
    output: context.output ?? process.stdout,
  });
  plan.writeJson(
    path.join(workspace.root, LOCAL_STATE_NAME),
    local,
    "record workspace-local system binding (not authentication)",
    0o600,
  );
  return 0;
}

/** Reports configuration state without treating stored identity as live evidence. */
export function systemStatusCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = bindingArguments(
    tokens,
    ["workspace", "json", "help"],
    context,
  );
  if (booleanOption(options, "help")) return 0;
  if (positionals.length > 1)
    throw new UsageError("system status accepts at most one id");
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const systems =
    positionals.length === 0
      ? workspace.manifest.externalSystems
      : [
          requireSystem(
            workspace.manifest.externalSystems,
            requireId(positionals, "status"),
          ),
        ];
  const local = loadLocalState(workspace.root);
  const statuses = systems.map((system) =>
    bindingStatus(system, getBinding(local.systemBindings, system.id)),
  );
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "json")) {
    output.write(
      `${JSON.stringify({ workspace: workspace.root, liveIdentityVerified: false, systems: statuses }, null, 2)}\n`,
    );
  } else {
    output.write(
      `Workspace: ${workspace.root}\nSaved configuration only; live identity is not verified.\n`,
    );
    for (const status of statuses)
      output.write(`${status.id}: ${status.state} — ${status.details}\n`);
    if (statuses.length === 0) output.write("No external systems declared.\n");
  }
  return 0;
}

/** Fails closed unless fresh supplied observations match this workspace's constraints. */
export function systemCheckCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = bindingArguments(
    tokens,
    OBSERVATION_OPTIONS,
    context,
  );
  if (booleanOption(options, "help")) return 0;
  const id = requireId(positionals, "check");
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const system = requireSystem(workspace.manifest.externalSystems, id);
  const binding = getBinding(loadLocalState(workspace.root).systemBindings, id);
  const status = bindingStatus(system, binding);
  if (status.state !== "configured" || binding === undefined) {
    throw new UsageError(`system ${id} blocked: ${status.details}`);
  }
  const connector = connectorOption(options);
  const identity = observedIdentity(options);
  if (binding.connector !== connector)
    throw new UsageError(
      `system ${id} blocked: connector does not match this workspace's binding`,
    );
  assertIdentityMatch(system, identity);
  const mismatches = identityMismatches(binding.identity, identity);
  if (mismatches.length > 0)
    throw new UsageError(
      `system ${id} blocked: saved binding ${mismatches.join("; ")}`,
    );
  (context.output ?? process.stdout).write(
    `System ${id}: supplied live identity matches this workspace's contract and binding.\nNo provider was contacted by Braingraph. Access policy and required write approval still apply.\n`,
  );
  return 0;
}

function bindingStatus(
  system: ExternalSystem,
  binding: LocalSystemBinding | undefined,
): BindingStatus {
  if (system.status !== "active")
    return {
      id: system.id,
      state: "inactive",
      details: `integration is ${system.status}`,
    };
  if (system.identity === undefined)
    return {
      id: system.id,
      state: "unbound",
      details:
        "expected identity is undeclared; declare it before connector operations",
    };
  if (binding === undefined)
    return {
      id: system.id,
      state: "unbound",
      details: "no connector binding exists in this workspace",
    };
  const mismatches = identityMismatches(system.identity, binding.identity);
  return mismatches.length === 0
    ? {
        id: system.id,
        state: "configured",
        details:
          "saved mapping matches; fresh provider identity is still required",
      }
    : { id: system.id, state: "mismatch", details: mismatches.join("; ") };
}

function assertIdentityMatch(
  system: ExternalSystem,
  identity: ExternalSystemIdentity,
): void {
  if (system.identity === undefined)
    throw new UsageError(
      `system ${system.id} blocked: expected identity is undeclared`,
    );
  const mismatches = identityMismatches(system.identity, identity);
  if (mismatches.length > 0)
    throw new UsageError(
      `system ${system.id} blocked: ${mismatches.join("; ")}`,
    );
}

function bindingArguments(
  tokens: readonly string[],
  allowed: readonly string[],
  context: CommandContext,
): ReturnType<typeof parseArgs> {
  const parsed = parseArgs(tokens);
  rejectUnknownOptions(parsed.options, allowed);
  if (booleanOption(parsed.options, "help"))
    (context.output ?? process.stdout).write(`${BINDING_HELP}\n`);
  return parsed;
}

function requireId(positionals: readonly string[], operation: string): string {
  if (positionals.length !== 1)
    throw new UsageError(`system ${operation} requires one id`);
  return assertSlug(positionals[0], "external system id");
}

function requireSystem(
  systems: readonly ExternalSystem[],
  id: string,
): ExternalSystem {
  const system = systems.find((entry) => entry.id === id);
  if (system === undefined)
    throw new UsageError(`unknown external system: ${id}`);
  return system;
}

function connectorOption(options: OptionMap): string {
  const connector = stringOption(options, "connector");
  if (!isIdentityString(connector))
    throw new UsageError(
      "--connector requires a non-secret, trimmed, single-line connector identifier",
    );
  return connector;
}

function observedIdentity(options: OptionMap): ExternalSystemIdentity {
  const identity: ExternalSystemIdentity = {};
  for (const field of IDENTITY_FIELDS) {
    const value = stringOption(options, field);
    if (value !== undefined) Reflect.set(identity, field, value);
  }
  const errors = validateSystemIdentity(identity, "observed identity");
  if (errors.length > 0) throw new UsageError(errors.join("; "));
  return identity;
}

function getBinding(
  bindings: Record<string, LocalSystemBinding> | undefined,
  id: string,
): LocalSystemBinding | undefined {
  return Object.entries(bindings ?? {}).find(([key]) => key === id)?.[1];
}
