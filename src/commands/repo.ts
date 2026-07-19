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
import { git, gitOutput, refExists } from "../git.js";
import { LOCAL_STATE_NAME, loadLocalState } from "../local-state.js";
import { loadWorkspace, validateManifest } from "../manifest.js";
import { commandExists, displayCommand } from "../process.js";
import { templateContent } from "../templates.js";
import type {
  AttachedRepositoryConfig,
  CommandContext,
  LoadedWorkspace,
  ManagedRepositoryConfig,
  OptionMap,
  OutputStream,
  RepositoryConfig,
} from "../types.js";
import {
  assertCanonicalPathInside,
  assertRelativePath,
  assertSlug,
  resolveInside,
  sameCanonicalPath,
  sameJson,
  slugify,
} from "../util.js";

interface CloneRepositoryOptions {
  workspaceRoot: string;
  hub: string;
  repository: ManagedRepositoryConfig;
  dryRun: boolean;
  output: OutputStream;
}

interface ExistingManagedRepositoryOptions {
  id: string;
  workspaceRoot: string;
  hub: string;
  requested: ManagedRepositoryConfig;
  existing: RepositoryConfig;
  shouldClone: boolean;
  dryRun: boolean;
  output: OutputStream;
}

interface PersistAttachedRepositoryOptions {
  id: string;
  workspace: LoadedWorkspace;
  repository: AttachedRepositoryConfig;
  updatedManifest: LoadedWorkspace["manifest"];
  updatedLocalState: ReturnType<typeof loadLocalState>;
  hub: string;
  checkout: string;
  bridge: boolean;
  dryRun: boolean;
  output: OutputStream;
  isNew: boolean;
}

const BRIDGE_MARKER = "# Braingraph local agent bridge";
const CLAUDE_ADAPTER = "@AGENTS.md\n";
const INTEGRATION_BRANCH_OPTION = "integration-branch";
const PRODUCTION_BRANCH_OPTION = "production-branch";
const REPOSITORY_PATH_LABEL = "repository path";
const REPOSITORY_ID_LABEL = "repository id";
const REPOSITORY_URL_OPTION = "url";

export const REPO_HELP = `Usage:
  braingraph repo add <id> --url <url> --integration-branch <branch> [options]
  braingraph repo attach <id> --checkout <directory> --integration-branch <branch> [options]
  braingraph repo remove <id> --confirm <id> [--execute | --dry-run]

add options:
  --production-branch <branch>
  --stable-name <directory>      Stable integration worktree name
  --path <relative-path>         Hub path (default: repositories/<id>)
  --branch-prefix <prefix>       Feature branch prefix (default: work/)
  --no-clone                     Register and scaffold without cloning

attach options:
  --checkout <directory>         Existing Git checkout; stored only in local state
  --url <url>                    Expected origin URL (default: checkout origin)
  --production-branch <branch>
  --path <relative-path>         Governance hub path (default: repositories/<id>)
  --no-bridge                    Do not create ignored local AGENTS.md/CLAUDE.md bridges

shared options:
  --workspace <directory>
  --dry-run

remove preserves repository hubs, checkouts, bridges, worktrees, and branches. It
only removes Braingraph registration and machine-local attachment state.`;

/** Registers a managed repository and optionally creates its stable worktree. */
export function repoAddCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    REPOSITORY_URL_OPTION,
    INTEGRATION_BRANCH_OPTION,
    PRODUCTION_BRANCH_OPTION,
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
  if (positionals.length !== 1) {
    throw new UsageError("repo add requires one repository id");
  }
  ensureGit();

  const id = assertSlug(positionals[0], REPOSITORY_ID_LABEL);
  const workspace = loadSoftwareWorkspace(options);
  const integrationBranch = validateBranch(
    requiredOption(options, INTEGRATION_BRANCH_OPTION),
    "integration branch",
  );
  const repository: ManagedRepositoryConfig = {
    mode: "managed",
    url: assertSafeRepositoryUrl(
      requiredOption(options, REPOSITORY_URL_OPTION),
    ),
    path: assertRelativePath(
      stringOption(options, "path", `repositories/${id}`),
      REPOSITORY_PATH_LABEL,
    ),
    integrationBranch,
    productionBranch: optionalBranch(options, PRODUCTION_BRANCH_OPTION),
    stableWorktree: assertSlug(
      stringOption(options, "stable-name") ?? slugify(integrationBranch),
      "stable worktree name",
    ),
    branchPrefix: validateBranchPrefix(
      stringOption(options, "branch-prefix", "work/"),
    ),
  };
  const dryRun = booleanOption(options, "dry-run");
  const shouldClone = booleanOption(options, "clone", true);
  const existing = repositoryById(workspace.manifest.repositories, id);
  const hub = managedHub(workspace.root, repository.path);
  if (existing !== undefined) {
    handleExistingManagedRepository({
      id,
      workspaceRoot: workspace.root,
      hub,
      requested: repository,
      existing,
      shouldClone,
      dryRun,
      output,
    });
    return 0;
  }
  validateRemoteBranches(repository);
  if (fs.existsSync(hub)) {
    throw new UsageError(`repository hub already exists: ${hub}`);
  }

  const updated = structuredClone(workspace.manifest);
  Reflect.set(updated.repositories, id, repository);
  assertValidManifest(updated);
  const plan = new ActionPlan({ root: workspace.root, dryRun, output });
  try {
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
    plan.writeJson(workspace.file, updated, "register repository");
  } catch (error: unknown) {
    if (!dryRun) rollbackNewHub(workspace.root, hub);
    throw error;
  }
  return 0;
}

/** Attaches an established checkout without changing its Git layout. */
export function repoAttachCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    "checkout",
    REPOSITORY_URL_OPTION,
    INTEGRATION_BRANCH_OPTION,
    PRODUCTION_BRANCH_OPTION,
    "path",
    "bridge",
    "workspace",
    "dry-run",
    "help",
  ]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${REPO_HELP}\n`);
    return 0;
  }
  if (positionals.length !== 1) {
    throw new UsageError("repo attach requires one repository id");
  }
  ensureGit();

  const id = assertSlug(positionals[0], REPOSITORY_ID_LABEL);
  const workspace = loadSoftwareWorkspace(options);
  const checkout = validateCheckout(requiredOption(options, "checkout"));
  const actualUrl = assertSafeRepositoryUrl(
    gitOutput(checkout, ["remote", "get-url", "origin"]),
  );
  const requestedUrl = stringOption(options, REPOSITORY_URL_OPTION);
  if (
    requestedUrl !== undefined &&
    !sameRepositoryUrl(assertSafeRepositoryUrl(requestedUrl), actualUrl)
  ) {
    throw new UsageError("attached checkout origin does not match --url");
  }
  const integrationBranch = validateBranch(
    requiredOption(options, INTEGRATION_BRANCH_OPTION),
    "integration branch",
  );
  assertCheckoutRef(checkout, integrationBranch);
  const productionBranch = optionalBranch(options, PRODUCTION_BRANCH_OPTION);
  if (productionBranch !== null) assertCheckoutRef(checkout, productionBranch);

  const repository: AttachedRepositoryConfig = {
    mode: "attached",
    url: actualUrl,
    path: assertRelativePath(
      stringOption(options, "path", `repositories/${id}`),
      REPOSITORY_PATH_LABEL,
    ),
    integrationBranch,
    productionBranch,
  };
  const bridge = booleanOption(options, "bridge", true);
  const hub = managedHub(workspace.root, repository.path);
  const existing = repositoryById(workspace.manifest.repositories, id);
  assertAttachmentRegistrationAvailable(id, repository, existing, hub);

  const localState = loadLocalState(workspace.root);
  const existingAttachment = attachmentById(localState.attachments, id);
  const attachment = { checkoutPath: checkout, bridge };
  if (
    existingAttachment !== undefined &&
    !sameJson(existingAttachment, attachment)
  ) {
    throw new UsageError(
      `repository ${id} already has a different local attachment; use repo remove before reattaching`,
    );
  }
  if (bridge) assertBridgeCompatible(checkout, workspace.root, hub);

  const updatedManifest = structuredClone(workspace.manifest);
  Reflect.set(updatedManifest.repositories, id, repository);
  assertValidManifest(updatedManifest);
  const updatedLocalState = structuredClone(localState);
  Reflect.set(updatedLocalState.attachments, id, attachment);

  const dryRun = booleanOption(options, "dry-run");
  persistAttachedRepository({
    id,
    workspace,
    repository,
    updatedManifest,
    updatedLocalState,
    hub,
    checkout,
    bridge,
    dryRun,
    output,
    isNew: existing === undefined,
  });
  return 0;
}

/** Deregisters a repository while preserving every repository artifact. */
export function repoRemoveCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    "workspace",
    "confirm",
    "execute",
    "dry-run",
    "help",
  ]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${REPO_HELP}\n`);
    return 0;
  }
  if (positionals.length !== 1) {
    throw new UsageError("repo remove requires one repository id");
  }
  const id = assertSlug(positionals[0], REPOSITORY_ID_LABEL);
  const workspace = loadSoftwareWorkspace(options);
  const repository = repositoryById(workspace.manifest.repositories, id);
  if (repository === undefined)
    throw new UsageError(`unknown repository: ${id}`);

  const execute = booleanOption(options, "execute");
  const dryRun = booleanOption(options, "dry-run");
  if (execute === dryRun) {
    throw new UsageError(
      "repo remove requires exactly one of --execute or --dry-run",
    );
  }
  if (stringOption(options, "confirm") !== id) {
    throw new UsageError(`--confirm must exactly match ${id}`);
  }

  const updatedManifest = structuredClone(workspace.manifest);
  Reflect.deleteProperty(updatedManifest.repositories, id);
  const localState = loadLocalState(workspace.root);
  const updatedLocalState = structuredClone(localState);
  const hadAttachment = Reflect.deleteProperty(
    updatedLocalState.attachments,
    id,
  );
  const plan = new ActionPlan({ root: workspace.root, dryRun, output });
  if (hadAttachment) {
    plan.writeJson(
      path.join(workspace.root, LOCAL_STATE_NAME),
      updatedLocalState,
      "remove local checkout registration",
      0o600,
    );
  }
  plan.writeJson(workspace.file, updatedManifest, "deregister repository");
  output.write(
    `${dryRun ? "[dry-run] would preserve" : "Preserved"} repository hub, checkout, bridges, worktrees, and branches for ${id}\n`,
  );
  return 0;
}

function handleExistingManagedRepository(
  options: ExistingManagedRepositoryOptions,
): void {
  const {
    id,
    workspaceRoot,
    hub,
    requested,
    existing,
    shouldClone,
    dryRun,
    output,
  } = options;
  if (!sameJson(existing, requested)) {
    throw new UsageError(
      `repository ${id} already exists with different configuration; use repo remove before registering corrected configuration`,
    );
  }
  const plan = new ActionPlan({ root: workspaceRoot, dryRun, output });
  scaffoldRepositoryHub(id, hub, existing, plan);
  if (!shouldClone) {
    output.write(`Repository unchanged: ${id}\n`);
    return;
  }
  if (existing.mode !== "managed") {
    throw new UsageError(`repository ${id} is not a managed repository`);
  }
  ensureRepositoryClone({
    workspaceRoot,
    hub,
    repository: existing,
    dryRun,
    output,
  });
}

function assertAttachmentRegistrationAvailable(
  id: string,
  repository: AttachedRepositoryConfig,
  existing: RepositoryConfig | undefined,
  hub: string,
): void {
  if (existing !== undefined && !sameJson(existing, repository)) {
    throw new UsageError(
      `repository ${id} already exists with different configuration; use repo remove before attaching corrected configuration`,
    );
  }
  if (existing === undefined && fs.existsSync(hub)) {
    throw new UsageError(`repository hub already exists: ${hub}`);
  }
}

function persistAttachedRepository(
  options: PersistAttachedRepositoryOptions,
): void {
  const {
    id,
    workspace,
    repository,
    updatedManifest,
    updatedLocalState,
    hub,
    checkout,
    bridge,
    dryRun,
    output,
    isNew,
  } = options;
  const plan = new ActionPlan({ root: workspace.root, dryRun, output });
  try {
    scaffoldRepositoryHub(id, hub, repository, plan);
    if (bridge) {
      writeCheckoutBridge(checkout, workspace.root, hub, dryRun, output);
    }
    plan.writeJson(
      path.join(workspace.root, LOCAL_STATE_NAME),
      updatedLocalState,
      "record local checkout",
      0o600,
    );
    plan.writeJson(
      workspace.file,
      updatedManifest,
      "register attached repository",
    );
  } catch (error: unknown) {
    if (!dryRun && isNew) rollbackNewHub(workspace.root, hub);
    throw error;
  }
}

function repositoryById(
  repositories: Readonly<Record<string, RepositoryConfig>>,
  id: string,
): RepositoryConfig | undefined {
  return Object.entries(repositories).find(
    ([repositoryId]) => repositoryId === id,
  )?.[1];
}

function attachmentById(
  attachments: ReturnType<typeof loadLocalState>["attachments"],
  id: string,
): ReturnType<typeof loadLocalState>["attachments"][string] | undefined {
  return Object.entries(attachments).find(
    ([repositoryId]) => repositoryId === id,
  )?.[1];
}

function loadSoftwareWorkspace(options: OptionMap): LoadedWorkspace {
  const workspace = loadWorkspace(
    stringOption(options, "workspace") ?? process.cwd(),
  );
  if (!workspace.manifest.workspace.profiles.includes("software")) {
    throw new UsageError(
      "the software profile is not enabled for this workspace",
    );
  }
  return workspace;
}

function scaffoldRepositoryHub(
  id: string,
  hub: string,
  repository: RepositoryConfig,
  plan: ActionPlan,
): void {
  plan.ensureDirectory(hub);
  if (repository.mode === "managed") {
    plan.ensureDirectory(path.join(hub, ".artifacts-shared"));
  }
  const template =
    repository.mode === "managed"
      ? "software/repository-AGENTS.md"
      : "software/repository-attached-AGENTS.md";
  plan.writeMissing(
    path.join(hub, "AGENTS.md"),
    templateContent(template, {
      REPOSITORY_NAME: id,
      REPOSITORY_URL: repository.url,
      INTEGRATION_BRANCH:
        repository.mode === "managed"
          ? repository.stableWorktree
          : repository.integrationBranch,
    }),
  );
  plan.writeMissing(
    path.join(hub, "CLAUDE.md"),
    templateContent("software/repository-CLAUDE.md"),
  );
}

function ensureRepositoryClone(options: CloneRepositoryOptions): void {
  const { workspaceRoot, hub, repository, dryRun, output } = options;
  assertCanonicalPathInside(workspaceRoot, hub, "repository hub");
  const anchor = path.join(hub, ".bare");
  const stablePath = path.join(hub, repository.stableWorktree);
  assertCanonicalPathInside(workspaceRoot, anchor, "Git anchor");
  assertCanonicalPathInside(workspaceRoot, stablePath, "stable worktree");
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
  if (!sameRepositoryUrl(result.stdout.trim(), expectedUrl)) {
    throw new UsageError(
      `existing Git anchor origin does not match the registered repository: ${anchor}`,
    );
  }
}

function validateRemoteBranches(repository: ManagedRepositoryConfig): void {
  assertRemoteBranch(repository.url, repository.integrationBranch);
  if (
    repository.productionBranch !== null &&
    repository.productionBranch !== repository.integrationBranch
  ) {
    assertRemoteBranch(repository.url, repository.productionBranch);
  }
}

function assertRemoteBranch(url: string, branch: string): void {
  const result = git(
    ["ls-remote", "--exit-code", "--heads", url, `refs/heads/${branch}`],
    { allowFailure: true },
  );
  if (result.status !== 0) {
    throw new UsageError(`remote branch is unavailable: ${branch}`);
  }
}

function validateBranch(value: string, label: string): string {
  const result = git(["check-ref-format", "--branch", value], {
    allowFailure: true,
  });
  if (result.status !== 0)
    throw new UsageError(`${label} is not a valid Git branch`);
  return value;
}

function optionalBranch(options: OptionMap, key: string): string | null {
  const value = stringOption(options, key);
  return value === undefined
    ? null
    : validateBranch(value, key.replaceAll("-", " "));
}

function validateBranchPrefix(value: string): string {
  if (!value.endsWith("/") || value.length < 2) {
    throw new UsageError("branch prefix must be non-empty and end with /");
  }
  validateBranch(`${value}probe`, "branch prefix");
  return value;
}

/** Validates a repository remote before it enters canonical workspace state. */
export function assertSafeRepositoryUrl(value: string): string {
  if (value.length === 0 || /[\0\r\n`]/.test(value)) {
    throw new UsageError(
      "repository URL contains unsupported control or Markdown characters",
    );
  }
  if (value.includes("?") || value.includes("#")) {
    throw new UsageError(
      "repository URLs must not contain query strings or fragments",
    );
  }
  if (isScpStyleRemote(value) || isLocalRepositoryPath(value)) return value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UsageError("repository URL is not a supported Git remote form");
  }
  if (!["https:", "http:", "ssh:", "git:", "file:"].includes(parsed.protocol)) {
    throw new UsageError(
      `unsupported repository URL protocol: ${parsed.protocol}`,
    );
  }
  if (parsed.password.length > 0) {
    throw new UsageError(
      "repository URLs must not embed credentials; use the local Git credential manager",
    );
  }
  if (parsed.username.length > 0 && parsed.protocol !== "ssh:") {
    throw new UsageError(
      "repository URLs must not embed credentials; use the local Git credential manager",
    );
  }
  return value;
}

function isScpStyleRemote(value: string): boolean {
  return /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+$/.test(value);
}

function isLocalRepositoryPath(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    (!value.includes("://") && !value.includes("@"))
  );
}

function validateCheckout(value: string): string {
  const candidate = fs.realpathSync(path.resolve(value));
  if (!fs.statSync(candidate).isDirectory()) {
    throw new UsageError(`checkout is not a directory: ${candidate}`);
  }
  const root = fs.realpathSync(
    gitOutput(candidate, ["rev-parse", "--show-toplevel"]),
  );
  if (!sameCanonicalPath(root, candidate)) {
    throw new UsageError(`--checkout must identify the Git root: ${root}`);
  }
  return candidate;
}

function assertCheckoutRef(checkout: string, branch: string): void {
  const references = [branch, `origin/${branch}`];
  const found = references.some(
    (ref) =>
      git(
        ["-C", checkout, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
        {
          allowFailure: true,
        },
      ).status === 0,
  );
  if (!found)
    throw new UsageError(`checkout does not contain branch: ${branch}`);
}

function assertBridgeCompatible(
  checkout: string,
  workspaceRoot: string,
  hub: string,
): void {
  const expectedAgents = checkoutBridgeContent(workspaceRoot, hub);
  for (const [name, expected] of [
    ["AGENTS.md", expectedAgents],
    ["CLAUDE.md", CLAUDE_ADAPTER],
  ] as const) {
    const file = path.join(checkout, name);
    if (!fs.existsSync(file)) continue;
    if (
      !fs.statSync(file).isFile() ||
      fs.readFileSync(file, "utf8") !== expected
    ) {
      throw new UsageError(
        `${name} already exists in the attached checkout; rerun with --no-bridge and connect the canonical workspace from existing repository instructions`,
      );
    }
  }
}

function writeCheckoutBridge(
  checkout: string,
  workspaceRoot: string,
  hub: string,
  dryRun: boolean,
  output: OutputStream,
): void {
  const excludePath = gitOutput(checkout, [
    "rev-parse",
    "--git-path",
    "info/exclude",
  ]);
  const resolvedExclude = path.isAbsolute(excludePath)
    ? excludePath
    : path.resolve(checkout, excludePath);
  const excludePlan = new ActionPlan({
    root: path.dirname(path.dirname(resolvedExclude)),
    dryRun,
    output,
  });
  excludePlan.ensureTextBlock(
    resolvedExclude,
    BRIDGE_MARKER,
    `${BRIDGE_MARKER}\n/AGENTS.md\n/CLAUDE.md\n`,
  );
  const checkoutPlan = new ActionPlan({ root: checkout, dryRun, output });
  checkoutPlan.writeMissing(
    path.join(checkout, "AGENTS.md"),
    checkoutBridgeContent(workspaceRoot, hub),
  );
  checkoutPlan.writeMissing(path.join(checkout, "CLAUDE.md"), CLAUDE_ADAPTER);
}

function checkoutBridgeContent(workspaceRoot: string, hub: string): string {
  return `# Braingraph Local Workspace Bridge

This ignored, machine-local file is a discovery adapter, not canonical policy.

1. Read \`${escapeMarkdownCodePath(path.join(workspaceRoot, "AGENTS.md"))}\`.
2. Read \`${escapeMarkdownCodePath(path.join(hub, "AGENTS.md"))}\`.
3. Read this checkout's repository-native instructions after those workspace guides.

Do not copy durable policy into this file. Update the canonical Braingraph workspace instead.
`;
}

function escapeMarkdownCodePath(value: string): string {
  return value.replaceAll("`", "\\`");
}

function sameRepositoryUrl(left: string, right: string): boolean {
  if (isLocalRepositoryPath(left) && isLocalRepositoryPath(right)) {
    return sameCanonicalPath(left, right);
  }
  return left === right;
}

function managedHub(workspaceRoot: string, relative: string): string {
  const hub = resolveInside(workspaceRoot, relative, "repository path");
  assertCanonicalPathInside(workspaceRoot, hub, "repository hub");
  return hub;
}

function rollbackNewHub(workspaceRoot: string, hub: string): void {
  assertCanonicalPathInside(workspaceRoot, hub, "repository rollback path");
  fs.rmSync(hub, { recursive: true, force: true });
}

function assertValidManifest(manifest: unknown): void {
  const errors = validateManifest(manifest);
  if (errors.length > 0) throw new UsageError(errors.join("; "));
}

function ensureGit(): void {
  if (!commandExists("git")) {
    throw new UsageError(
      "Git is required for repository registration and validation",
    );
  }
}

function requiredOption(options: OptionMap, key: string): string {
  const value = stringOption(options, key);
  if (!value) throw new UsageError(`--${key} is required`);
  return value;
}
