import fs from "node:fs";
import path from "node:path";

import {
  booleanOption,
  parseArgs,
  rejectUnknownOptions,
  stringOption,
} from "../args.js";
import { UsageError } from "../errors.js";
import { git, inspectWorktree, refExists } from "../git.js";
import { loadWorkspace } from "../manifest.js";
import { commandExists, displayCommand, run } from "../process.js";
import type {
  CommandContext,
  OptionMap,
  OutputStream,
  RepositoryConfig,
  WorktreeInspection,
  WorktreeInspectionWithProcesses,
  WorktreeProcess,
  WorkspaceManifest,
} from "../types.js";
import { assertSlug } from "../util.js";

const REMOVAL_REASONS = [
  "merged-pr",
  "closed-pr",
  "review-complete",
  "superseded",
  "no-longer-needed",
] as const;
const REPOSITORY_ID_LABEL = "repository id";
const ORIGIN_REMOTE = "origin";

export const WORKTREE_HELP = `Usage:
  braingraph worktree new <repository> <name> [options]
  braingraph worktree inspect <repository> <name> [--json]
  braingraph worktree remove <repository> <name> [options]

new options:
  --base <ref>              Default: origin/<integration branch>
  --branch <branch>         Default: <configured prefix><name>
  --no-fetch
  --workspace <directory>
  --dry-run

remove options:
  --confirm <repo/name>     Exact confirmation token
  --reason <reason>         ${REMOVAL_REASONS.join(" | ")}
  --execute                 Required to remove; otherwise inspection only
  --workspace <directory>
  --dry-run

Removal never uses force and never deletes local or remote branches.`;

/** Creates an isolated feature worktree from a configured repository. */
export function worktreeNewCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    "base",
    "branch",
    "fetch",
    "workspace",
    "dry-run",
    "help",
  ]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${WORKTREE_HELP}\n`);
    return 0;
  }
  if (positionals.length !== 2)
    throw new UsageError("worktree new requires repository id and name");
  const repositoryId = assertSlug(positionals[0], REPOSITORY_ID_LABEL);
  const name = assertSlug(positionals[1], "worktree name");
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const repository = getRepository(workspace.manifest, repositoryId);
  if (name === repository.stableWorktree)
    throw new UsageError(
      "worktree name is reserved for the stable integration worktree",
    );
  const hub = path.join(workspace.root, repository.path);
  const anchor = path.join(hub, ".bare");
  const target = path.join(hub, name);
  if (!fs.existsSync(anchor))
    throw new UsageError(`missing Git anchor: ${anchor}`);
  if (fs.existsSync(target))
    throw new UsageError(`worktree path already exists: ${target}`);
  const branch = stringOption(
    options,
    "branch",
    `${repository.branchPrefix}${name}`,
  );
  const base = stringOption(
    options,
    "base",
    `${ORIGIN_REMOTE}/${repository.integrationBranch}`,
  );
  git(["-C", anchor, "check-ref-format", "--branch", branch]);

  const dryRun = booleanOption(options, "dry-run");
  if (booleanOption(options, "fetch", true)) {
    executeGit(
      ["-C", anchor, "fetch", ORIGIN_REMOTE, "--prune"],
      dryRun,
      output,
    );
  }
  const localRef = `refs/heads/${branch}`;
  const args = refExists(anchor, localRef)
    ? ["-C", anchor, "worktree", "add", target, branch]
    : ["-C", anchor, "worktree", "add", "-b", branch, target, base];
  executeGit(args, dryRun, output);
  return 0;
}

/** Reports worktree safety and integration state without mutating it. */
export function worktreeInspectCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["workspace", "json", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${WORKTREE_HELP}\n`);
    return 0;
  }
  if (positionals.length !== 2)
    throw new UsageError("worktree inspect requires repository id and name");
  const inspection = inspectConfiguredWorktree(positionals, options);
  const processes = processesUsing(inspection.path);
  const result = { ...inspection, processes };
  if (booleanOption(options, "json"))
    output.write(`${JSON.stringify(result, null, 2)}\n`);
  else printInspection(result, output);
  return 0;
}

/** Removes an explicitly confirmed clean worktree while preserving its branch. */
export function worktreeRemoveCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    "workspace",
    "confirm",
    "reason",
    "execute",
    "dry-run",
    "help",
  ]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${WORKTREE_HELP}\n`);
    return 0;
  }
  if (positionals.length !== 2)
    throw new UsageError("worktree remove requires repository id and name");
  const inspection = inspectConfiguredWorktree(positionals, options);
  const processes = processesUsing(inspection.path);
  const result = { ...inspection, processes };
  printInspection(result, output);

  if (!inspection.registered)
    throw new UsageError("path is not a registered worktree");
  if (!inspection.clean)
    throw new UsageError(
      "worktree is dirty; preserve or resolve changes before cleanup",
    );
  if (inspection.currentProcessInside)
    throw new UsageError("the current process is inside the worktree");
  if (processes.length > 0)
    throw new UsageError("processes are using the worktree");
  if (positionals[1] === inspection.stableWorktree)
    throw new UsageError("stable integration worktrees are protected");
  assertRecoverableBranchState(inspection);

  const execute = booleanOption(options, "execute");
  const dryRun = booleanOption(options, "dry-run");
  if (!execute && !dryRun) {
    output.write(
      "\nInspection only; nothing was removed. Obtain explicit human confirmation for the exact identifier.\n",
    );
    return 0;
  }
  const confirmation = stringOption(options, "confirm");
  const reason = stringOption(options, "reason");
  if (confirmation !== inspection.identifier) {
    throw new UsageError(
      `--confirm must exactly match ${inspection.identifier}`,
    );
  }
  if (reason === undefined || !isRemovalReason(reason)) {
    throw new UsageError(
      `--reason must be one of: ${REMOVAL_REASONS.join(", ")}`,
    );
  }

  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const repository = getRepository(
    workspace.manifest,
    assertSlug(positionals[0], REPOSITORY_ID_LABEL),
  );
  const anchor = path.join(workspace.root, repository.path, ".bare");
  executeGit(
    ["-C", anchor, "worktree", "remove", inspection.path],
    dryRun,
    output,
  );
  executeGit(["-C", anchor, "worktree", "prune"], dryRun, output);
  output.write(
    `${dryRun ? "[dry-run] would preserve" : "Preserved"} branch: ${inspection.branch ?? "(detached)"}\n`,
  );
  return 0;
}

function assertRecoverableBranchState(inspection: WorktreeInspection): void {
  const commits = inspection.commitsNotInIntegrationBranch;
  if (commits === null) {
    throw new UsageError(
      "could not verify commits against the integration branch; fetch and inspect before cleanup",
    );
  }
  if (commits === 0) return;
  if (
    inspection.upstream === null ||
    inspection.ahead === null ||
    inspection.ahead > 0
  ) {
    throw new UsageError(
      "worktree has commits not recoverable from its upstream; push or otherwise preserve them before cleanup",
    );
  }
}

function inspectConfiguredWorktree(
  positionals: readonly string[],
  options: OptionMap,
): WorktreeInspection {
  const repositoryId = assertSlug(positionals[0], REPOSITORY_ID_LABEL);
  const name = assertSlug(positionals[1], "worktree name");
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  const repository = getRepository(workspace.manifest, repositoryId);
  return inspectWorktree({
    workspaceRoot: workspace.root,
    repositoryId,
    repository,
    name,
  });
}

function getRepository(
  manifest: WorkspaceManifest,
  id: string,
): RepositoryConfig {
  const repository = Object.entries(manifest.repositories).find(
    ([repositoryId]) => repositoryId === id,
  )?.[1];
  if (!repository) throw new UsageError(`unknown repository: ${id}`);
  return repository;
}

function executeGit(
  args: readonly string[],
  dryRun: boolean,
  output: OutputStream,
): void {
  output.write(`${dryRun ? "[dry-run] " : ""}${displayCommand("git", args)}\n`);
  if (!dryRun) git(args, { stdio: "inherit" });
}

function isRemovalReason(
  value: string,
): value is (typeof REMOVAL_REASONS)[number] {
  return REMOVAL_REASONS.some((reason) => reason === value);
}

function processesUsing(worktreePath: string): WorktreeProcess[] {
  if (process.platform === "win32" || !commandExists("lsof")) return [];
  const result = run("lsof", ["-a", "-d", "cwd", "-Fpn"], {
    allowFailure: true,
  });
  const matches: WorktreeProcess[] = [];
  let pid: string | null = null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    if (line.startsWith("n")) {
      const cwd = line.slice(1);
      const relative = path.relative(worktreePath, cwd);
      if (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
      ) {
        matches.push({ pid, cwd });
      }
    }
  }
  return matches;
}

function printInspection(
  inspection: WorktreeInspectionWithProcesses,
  output: OutputStream,
): void {
  output.write("Worktree inspection\n");
  output.write(`  Identifier: ${inspection.identifier}\n`);
  output.write(`  Path: ${inspection.path}\n`);
  output.write(`  Branch: ${inspection.branch ?? "(detached)"}\n`);
  output.write(
    `  Integration branch: ${inspection.expectedIntegrationBranch}\n`,
  );
  output.write(`  Registered: ${String(inspection.registered)}\n`);
  output.write(`  Clean: ${String(inspection.clean)}\n`);
  output.write(`  Upstream: ${inspection.upstream ?? "none"}\n`);
  output.write(
    `  Ahead/behind: ${String(inspection.ahead ?? "unknown")}/${String(inspection.behind ?? "unknown")}\n`,
  );
  output.write(
    `  Commits not in integration branch: ${String(inspection.commitsNotInIntegrationBranch ?? "unknown")}\n`,
  );
  output.write(
    `  Processes using worktree: ${String(inspection.processes.length)}\n`,
  );
  output.write("  Branch deletion: not performed\n");
}
