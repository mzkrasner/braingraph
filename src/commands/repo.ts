import fs from "node:fs";
import path from "node:path";

import {
  booleanOption,
  parseArgs,
  rejectUnknownOptions,
  stringOption,
} from "../args.js";
import { UsageError } from "../errors.js";
import { ActionPlan } from "../files.js";
import { git, refExists } from "../git.js";
import { loadWorkspace, validateManifest } from "../manifest.js";
import { displayCommand, commandExists } from "../process.js";
import { templateContent } from "../templates.js";
import type {
  CommandContext,
  OptionMap,
  OutputStream,
  RepositoryConfig,
} from "../types.js";
import { assertRelativePath, assertSlug, sameJson, slugify } from "../util.js";

interface CloneRepositoryOptions {
  workspaceRoot: string;
  hub: string;
  repository: RepositoryConfig;
  dryRun: boolean;
  output: OutputStream;
}

export const REPO_HELP = `Usage:
  braingraph repo add <id> --url <url> --integration-branch <branch> [options]

Options:
  --production-branch <branch>
  --stable-name <directory>      Stable integration worktree name
  --path <relative-path>         Hub path (default: repositories/<id>)
  --branch-prefix <prefix>       Feature branch prefix (default: work/)
  --no-clone                     Register and scaffold without cloning
  --workspace <directory>
  --dry-run`;

/** Registers a repository and optionally creates its stable worktree hub. */
export function repoAddCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    "url",
    "integration-branch",
    "production-branch",
    "stable-name",
    "path",
    "branch-prefix",
    "clone",
    "workspace",
    "dry-run",
    "help",
  ]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${REPO_HELP}\n`);
    return 0;
  }
  if (positionals.length !== 1)
    throw new UsageError("repo add requires one repository id");
  const id = assertSlug(positionals[0], "repository id");
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  if (!workspace.manifest.workspace.profiles.includes("software")) {
    throw new UsageError(
      "the software profile is not enabled for this workspace",
    );
  }

  const url = assertSafeRepositoryUrl(requiredOption(options, "url"));
  const integrationBranch = requiredOption(options, "integration-branch");
  const stableWorktree = assertSlug(
    stringOption(options, "stable-name") ?? slugify(integrationBranch),
    "stable worktree name",
  );
  const repository: RepositoryConfig = {
    url,
    path: assertRelativePath(
      stringOption(options, "path", `repositories/${id}`),
      "repository path",
    ),
    integrationBranch,
    productionBranch: stringOption(options, "production-branch") ?? null,
    stableWorktree,
    branchPrefix: stringOption(options, "branch-prefix", "work/"),
  };
  const dryRun = booleanOption(options, "dry-run");
  const shouldClone = booleanOption(options, "clone", true);
  if (shouldClone && !commandExists("git")) {
    throw new UsageError("Git is required when repository cloning is enabled");
  }
  const existing = findRepository(workspace.manifest.repositories, id);
  if (existing) {
    if (!sameJson(existing, repository))
      throw new UsageError(
        `repository ${id} already exists with different configuration`,
      );
    const plan = new ActionPlan({ dryRun, output });
    const existingHub = path.join(workspace.root, existing.path);
    scaffoldRepositoryHub(id, existingHub, existing, plan);
    if (shouldClone) {
      ensureRepositoryClone({
        workspaceRoot: workspace.root,
        hub: existingHub,
        repository: existing,
        dryRun,
        output,
      });
    } else {
      output.write(`Repository unchanged: ${id}\n`);
    }
    return 0;
  }

  const updated = structuredClone(workspace.manifest);
  updated.repositories = Object.fromEntries([
    ...Object.entries(updated.repositories),
    [id, repository],
  ]);
  const errors = validateManifest(updated);
  if (errors.length) throw new UsageError(errors.join("; "));
  const plan = new ActionPlan({ dryRun, output });
  const hub = path.join(workspace.root, repository.path);
  if (fs.existsSync(hub) && fs.readdirSync(hub).length > 0) {
    throw new UsageError(`repository hub is not empty: ${hub}`);
  }
  plan.writeJson(workspace.file, updated, "register repository");
  scaffoldRepositoryHub(id, hub, repository, plan);

  if (shouldClone) {
    ensureRepositoryClone({
      workspaceRoot: workspace.root,
      hub,
      repository,
      dryRun,
      output,
    });
  }
  return 0;
}

function scaffoldRepositoryHub(
  id: string,
  hub: string,
  repository: RepositoryConfig,
  plan: ActionPlan,
): void {
  plan.ensureDirectory(hub);
  plan.ensureDirectory(path.join(hub, ".artifacts-shared"));
  plan.writeMissing(
    path.join(hub, "AGENTS.md"),
    templateContent("software/repository-AGENTS.md", {
      REPOSITORY_NAME: id,
      REPOSITORY_URL: repository.url,
      INTEGRATION_BRANCH: repository.stableWorktree,
    }),
  );
}

function ensureRepositoryClone(options: CloneRepositoryOptions): void {
  const { workspaceRoot, hub, repository, dryRun, output } = options;
  const anchor = path.join(hub, ".bare");
  const stablePath = path.join(hub, repository.stableWorktree);
  const anchorExists = fs.existsSync(anchor);
  const stableExists = fs.existsSync(stablePath);
  if (stableExists && !anchorExists) {
    throw new UsageError(
      `stable worktree exists without its Git anchor: ${stablePath}`,
    );
  }
  if (!anchorExists) {
    executeGit(["init", "--bare", anchor], workspaceRoot, dryRun, output);
    executeGit(
      ["-C", anchor, "remote", "add", "origin", repository.url],
      workspaceRoot,
      dryRun,
      output,
    );
  } else {
    ensureMatchingOrigin(anchor, repository.url, workspaceRoot, dryRun, output);
  }
  executeGit(
    [
      "-C",
      anchor,
      "config",
      "remote.origin.fetch",
      "+refs/heads/*:refs/remotes/origin/*",
    ],
    workspaceRoot,
    dryRun,
    output,
  );
  executeGit(
    ["-C", anchor, "fetch", "origin", "--prune"],
    workspaceRoot,
    dryRun,
    output,
  );
  const remoteRef = `refs/remotes/origin/${repository.integrationBranch}`;
  if (!dryRun && !refExists(anchor, remoteRef)) {
    throw new UsageError(
      `remote branch not found after fetch: ${repository.integrationBranch}`,
    );
  }
  if (stableExists) {
    output.write(`Stable worktree already exists: ${stablePath}\n`);
    return;
  }
  const localRef = `refs/heads/${repository.integrationBranch}`;
  const addArgs =
    !dryRun && refExists(anchor, localRef)
      ? [
          "-C",
          anchor,
          "worktree",
          "add",
          stablePath,
          repository.integrationBranch,
        ]
      : [
          "-C",
          anchor,
          "worktree",
          "add",
          "-b",
          repository.integrationBranch,
          stablePath,
          `origin/${repository.integrationBranch}`,
        ];
  executeGit(addArgs, workspaceRoot, dryRun, output);
  executeGit(
    [
      "-C",
      stablePath,
      "branch",
      "--set-upstream-to",
      `origin/${repository.integrationBranch}`,
      repository.integrationBranch,
    ],
    workspaceRoot,
    dryRun,
    output,
  );
}

function executeGit(
  args: readonly string[],
  cwd: string,
  dryRun: boolean,
  output: OutputStream,
): void {
  output.write(`${dryRun ? "[dry-run] " : ""}${displayCommand("git", args)}\n`);
  if (!dryRun) git(args, { cwd, stdio: "inherit" });
}

function ensureMatchingOrigin(
  anchor: string,
  expectedUrl: string,
  cwd: string,
  dryRun: boolean,
  output: OutputStream,
): void {
  const result = git(["-C", anchor, "remote", "get-url", "origin"], {
    allowFailure: true,
  });
  if (result.status !== 0) {
    executeGit(
      ["-C", anchor, "remote", "add", "origin", expectedUrl],
      cwd,
      dryRun,
      output,
    );
    return;
  }
  if (result.stdout.trim() !== expectedUrl) {
    throw new UsageError(
      `existing Git anchor origin does not match the registered repository: ${anchor}`,
    );
  }
}

function requiredOption(options: OptionMap, key: string): string {
  const value = stringOption(options, key);
  if (!value) throw new UsageError(`--${key} is required`);
  return value;
}

function assertSafeRepositoryUrl(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+@/i.test(value)) {
    throw new UsageError(
      "repository URLs must not embed credentials; use the local Git credential manager",
    );
  }
  return value;
}

function findRepository(
  repositories: Record<string, RepositoryConfig>,
  id: string,
): RepositoryConfig | undefined {
  return Object.entries(repositories).find(
    ([repositoryId]) => repositoryId === id,
  )?.[1];
}
