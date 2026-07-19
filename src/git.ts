import fs from "node:fs";
import path from "node:path";

import { run } from "./process.js";
import type {
  ProcessOptions,
  ProcessResult,
  RegisteredWorktree,
  ManagedRepositoryConfig,
  WorktreeInspection,
} from "./types.js";
import { canonicalPath, sameCanonicalPath } from "./util.js";

interface InspectWorktreeOptions {
  workspaceRoot: string;
  repositoryId: string;
  repository: ManagedRepositoryConfig;
  name: string;
}

/** Runs Git with normalized subprocess behavior. */
export function git(
  args: readonly string[],
  options: ProcessOptions = {},
): ProcessResult {
  return run("git", args, options);
}

/** Runs Git in a repository and returns trimmed stdout. */
export function gitOutput(
  cwd: string,
  args: readonly string[],
  options: ProcessOptions = {},
): string {
  return git(["-C", cwd, ...args], options).stdout.trim();
}

/** Checks whether an exact Git reference exists. */
export function refExists(anchor: string, ref: string): boolean {
  return (
    git(["-C", anchor, "show-ref", "--verify", "--quiet", ref], {
      allowFailure: true,
    }).status === 0
  );
}

/** Parses the registered worktrees reported by Git porcelain output. */
export function registeredWorktrees(anchor: string): RegisteredWorktree[] {
  const output = gitOutput(anchor, ["worktree", "list", "--porcelain", "-z"]);
  const entries: RegisteredWorktree[] = [];
  let current: RegisteredWorktree | undefined;
  for (const line of output.split("\0")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length) };
      entries.push(current);
    } else if (current && line.startsWith("HEAD "))
      current.head = line.slice(5);
    else if (current && line.startsWith("branch "))
      current.branch = line.slice(7).replace("refs/heads/", "");
    else if (current && line === "detached") current.detached = true;
  }
  return entries;
}

/** Collects safety and integration state for one configured worktree. */
export function inspectWorktree(
  options: InspectWorktreeOptions,
): WorktreeInspection {
  const { workspaceRoot, repositoryId, repository, name } = options;
  const hub = path.resolve(workspaceRoot, repository.path);
  const anchor = path.join(hub, ".bare");
  const worktree = path.join(hub, name);
  if (!fs.existsSync(anchor)) throw new Error(`missing Git anchor: ${anchor}`);
  if (!fs.existsSync(worktree))
    throw new Error(`worktree not found: ${worktree}`);

  const registered = registeredWorktrees(anchor).some((entry) =>
    sameCanonicalPath(entry.path, worktree),
  );
  const status = gitOutput(worktree, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  const branch =
    gitOutput(worktree, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
      allowFailure: true,
    }) || null;
  const upstream =
    gitOutput(
      worktree,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { allowFailure: true },
    ) || null;
  let ahead: number | null = null;
  let behind: number | null = null;
  if (upstream) {
    const counts = gitOutput(
      worktree,
      ["rev-list", "--left-right", "--count", `${upstream}...HEAD`],
      { allowFailure: true },
    );
    const countValues = counts.split(/\s+/).map(Number);
    const behindValue = countValues[0];
    const aheadValue = countValues[1];
    if (
      aheadValue !== undefined &&
      behindValue !== undefined &&
      Number.isFinite(aheadValue) &&
      Number.isFinite(behindValue)
    ) {
      ahead = aheadValue;
      behind = behindValue;
    }
  }

  const integrationRef = `origin/${repository.integrationBranch}`;
  const localOnlyText = gitOutput(
    worktree,
    ["rev-list", "--count", `${integrationRef}..HEAD`],
    { allowFailure: true },
  );
  const localOnlyCommits = /^\d+$/.test(localOnlyText)
    ? Number(localOnlyText)
    : null;

  return {
    identifier: `${repositoryId}/${name}`,
    path: worktree,
    branch,
    expectedIntegrationBranch: repository.integrationBranch,
    stableWorktree: repository.stableWorktree,
    registered,
    clean: status.length === 0,
    status,
    upstream,
    ahead,
    behind,
    commitsNotInIntegrationBranch: localOnlyCommits,
    currentProcessInside: isInside(process.cwd(), worktree),
  };
}

function isInside(candidate: string, root: string): boolean {
  const canonicalRoot = canonicalPath(root);
  const canonicalCandidate = canonicalPath(candidate);
  const relative = path.relative(canonicalRoot, canonicalCandidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
