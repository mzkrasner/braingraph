import fs from "node:fs";
import path from "node:path";

import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
import { loadLocalState } from "../local-state.js";
import {
  loadWorkspace,
  SCHEMA_VERSION,
  TEMPLATE_VERSION,
  validateManifest,
} from "../manifest.js";
import { commandExists, run } from "../process.js";
import { qmdMask } from "../templates.js";
import type {
  CommandContext,
  LoadedWorkspace,
  LocalWorkspaceState,
  OutputStream,
  RepositoryConfig,
} from "../types.js";
import { assertCanonicalPathInside } from "../util.js";

import { MINIMUM_QMD_VERSION, supportedQmdVersion } from "./qmd.js";
import { isObsidianInstalled } from "./tools.js";

type CheckStatus = "ok" | "warning" | "error";

const CLAUDE_ADAPTER_CONTENT = "@AGENTS.md\n";
const VENDOR_SKILL_DIRECTORIES = [
  ".claude/skills",
  ".cursor/skills",
  ".grok/skills",
] as const;

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export const DOCTOR_HELP = `Usage:
  braingraph doctor [directory] [--json]

Validates the manifest, generated knowledge structure, Obsidian installation and
vault configuration, QMD installation and collection registration, and optional
software repository hubs. It does not mutate anything.`;

/** Inspects a workspace without mutating local or external state. */
export function doctorCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["json", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${DOCTOR_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("doctor accepts at most one directory");
  const workspace = loadWorkspace(positionals[0] ?? process.cwd());
  const vault = path.join(
    workspace.root,
    workspace.manifest.knowledge.directory,
  );
  const checks = [
    manifestCheck(workspace),
    ...instructionScopeChecks("workspace", workspace.root),
    artifactCheck(
      "workspace:gitignore",
      path.join(workspace.root, ".gitignore"),
      "file",
    ),
    artifactCheck(
      "workspace:schema",
      path.join(workspace.root, "schemas", "braingraph-workspace.schema.json"),
      "file",
    ),
    ...vaultChecks(workspace.root, vault),
    ...skillCatalogChecks(workspace.root),
    obsidianCheck(),
    ...qmdChecks(workspace, vault),
    ...softwareChecks(workspace),
  ];

  const summary = {
    workspace: workspace.root,
    checks,
    ok: !checks.some((entry) => entry.status === "error"),
  };
  if (booleanOption(options, "json"))
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
  else writeSummary(workspace.root, checks, output);
  return summary.ok ? 0 : 1;
}

function manifestCheck(workspace: LoadedWorkspace): DoctorCheck {
  const errors = validateManifest(workspace.manifest);
  const staleTemplates = workspace.manifest.templateVersion < TEMPLATE_VERSION;
  return check(
    "manifest",
    errors.length > 0 ? "error" : staleTemplates ? "warning" : "ok",
    errors.join("; ") ||
      (staleTemplates
        ? `generated templates ${String(workspace.manifest.templateVersion)} are older than current ${String(TEMPLATE_VERSION)}; review the available migration before updating`
        : `schema ${String(SCHEMA_VERSION)}, templates ${String(TEMPLATE_VERSION)}`),
  );
}

function vaultChecks(workspaceRoot: string, vault: string): DoctorCheck[] {
  const expected: readonly (readonly [string, "file" | "directory"])[] = [
    ["Start Here.md", "file"],
    ["index.md", "file"],
    ["log.md", "file"],
    ["projects", "directory"],
    ["domains", "directory"],
    ["wiki", "directory"],
    ["raw", "directory"],
    ["raw/README.md", "file"],
    ["raw/processed", "directory"],
    ["raw/attachments", "directory"],
    ["sources", "directory"],
    ["sources/Processing ledger.md", "file"],
    ["reports", "directory"],
    ["evals/retrieval/README.md", "file"],
    ["_templates/Project.md", "file"],
    ["_templates/Domain.md", "file"],
    ["_templates/Knowledge.md", "file"],
    ["_templates/Source.md", "file"],
    ["_templates/Report.md", "file"],
    [".gitignore", "file"],
    [".obsidian", "directory"],
    [".obsidian/app.json", "file"],
    [".obsidian/core-plugins.json", "file"],
    [".obsidian/templates.json", "file"],
  ];
  const checks = [
    canonicalContainmentCheck("vault:containment", workspaceRoot, vault),
    ...instructionScopeChecks("knowledge", vault),
    ...expected.map(([relative, type]) =>
      artifactCheck(`vault:${relative}`, path.join(vault, relative), type),
    ),
  ];
  checks.push(...placeholderChecks(workspaceRoot, vault));
  return checks;
}

function placeholderChecks(
  workspaceRoot: string,
  vault: string,
): DoctorCheck[] {
  const files: readonly (readonly [string, string])[] = [
    ["root-instructions", path.join(workspaceRoot, "AGENTS.md")],
    ["vault-instructions", path.join(vault, "AGENTS.md")],
    ["start-here", path.join(vault, "Start Here.md")],
  ];
  return files.flatMap(([label, file]) => {
    if (!isFile(file)) {
      return [
        check(
          `template-placeholders:${label}`,
          "error",
          `expected a readable file: ${file}`,
        ),
      ];
    }
    const unresolved = /\{\{[A-Z0-9_]+\}\}/.test(fs.readFileSync(file, "utf8"));
    return [
      check(
        `template-placeholders:${label}`,
        unresolved ? "error" : "ok",
        unresolved ? `unresolved placeholder in ${file}` : file,
      ),
    ];
  });
}

function instructionScopeChecks(
  scope: string,
  directory: string,
): DoctorCheck[] {
  const canonical = path.join(directory, "AGENTS.md");
  const adapter = path.join(directory, "CLAUDE.md");
  const adapterMatches =
    isFile(adapter) &&
    fs.readFileSync(adapter, "utf8").replaceAll("\r\n", "\n") ===
      CLAUDE_ADAPTER_CONTENT;
  return [
    check(
      `instructions:${scope}:canonical`,
      isFile(canonical) ? "ok" : "error",
      canonical,
    ),
    check(
      `instructions:${scope}:claude-adapter`,
      adapterMatches ? "ok" : "error",
      adapterMatches
        ? `${adapter} imports AGENTS.md`
        : `${adapter} must contain only @AGENTS.md`,
    ),
  ];
}

function skillCatalogChecks(workspaceRoot: string): DoctorCheck[] {
  const agentDirectory = path.join(workspaceRoot, ".agents");
  if (!fs.existsSync(agentDirectory)) return [];
  const agentDirectoryCheck = artifactCheck(
    "agent-skills:root",
    agentDirectory,
    "directory",
  );
  if (agentDirectoryCheck.status === "error") return [agentDirectoryCheck];
  const canonicalDirectory = path.join(workspaceRoot, ".agents", "skills");
  const containmentCheck = canonicalContainmentCheck(
    "agent-skills:containment",
    workspaceRoot,
    canonicalDirectory,
  );
  if (containmentCheck.status === "error") {
    return [agentDirectoryCheck, containmentCheck];
  }
  if (!fs.existsSync(canonicalDirectory)) {
    return [agentDirectoryCheck, containmentCheck];
  }
  const directoryCheck = artifactCheck(
    "agent-skills:canonical-directory",
    canonicalDirectory,
    "directory",
  );
  if (directoryCheck.status === "error") return [directoryCheck];
  const entries = fs.readdirSync(canonicalDirectory).sort();
  const skillArtifactChecks = entries.flatMap((name) => {
    const directory = path.join(canonicalDirectory, name);
    const skillDirectory = artifactCheck(
      `agent-skills:${name}:directory`,
      directory,
      "directory",
    );
    return skillDirectory.status === "error"
      ? [skillDirectory]
      : [
          skillDirectory,
          artifactCheck(
            `agent-skills:${name}:definition`,
            path.join(directory, "SKILL.md"),
            "file",
          ),
        ];
  });
  const canonicalSkills = skillNames(canonicalDirectory);

  const duplicates = VENDOR_SKILL_DIRECTORIES.flatMap((relative) => {
    const mirrored = new Set(skillNames(path.join(workspaceRoot, relative)));
    return canonicalSkills
      .filter((name) => mirrored.has(name))
      .map((name) => `${relative}/${name}`);
  });
  return [
    agentDirectoryCheck,
    containmentCheck,
    directoryCheck,
    ...skillArtifactChecks,
    check(
      "agent-skills:canonical-catalog",
      "ok",
      `${canonicalSkills.length.toString()} skill(s) in ${canonicalDirectory}`,
    ),
    check(
      "agent-skills:vendor-mirrors",
      duplicates.length === 0 ? "ok" : "warning",
      duplicates.length === 0
        ? "no duplicate client-specific skill names"
        : `duplicate canonical skill names: ${duplicates.join(", ")}`,
    ),
  ];
}

function skillNames(directory: string): string[] {
  if (!isDirectory(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => isFile(path.join(directory, name, "SKILL.md")))
    .sort();
}

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function obsidianCheck(): DoctorCheck {
  const installed = isObsidianInstalled();
  return check(
    "obsidian:application",
    installed ? "ok" : "warning",
    installed
      ? "installed"
      : "not detected; install from https://obsidian.md/download",
  );
}

function qmdChecks(workspace: LoadedWorkspace, vault: string): DoctorCheck[] {
  const stateContainment = canonicalContainmentCheck(
    "qmd:local-state-containment",
    workspace.root,
    path.join(workspace.root, ".qmd"),
  );
  const localConfig = ["index.yml", "index.yaml"]
    .map((name) => path.join(workspace.root, ".qmd", name))
    .find((candidate) => isFile(candidate));
  const localChecks = [
    stateContainment,
    check(
      "qmd:local-index",
      localConfig === undefined ? "warning" : "ok",
      localConfig ?? `missing; run braingraph qmd configure ${workspace.root}`,
    ),
    ...(localConfig === undefined
      ? []
      : [
          canonicalContainmentCheck(
            "qmd:local-index-file-containment",
            workspace.root,
            localConfig,
          ),
        ]),
  ];
  if (!commandExists("qmd")) {
    return [
      ...localChecks,
      check(
        "qmd:cli",
        "warning",
        "not installed; run braingraph tools install --dry-run",
      ),
    ];
  }
  const version = supportedQmdVersion(workspace.root);
  const checks: DoctorCheck[] = [
    ...localChecks,
    check(
      "qmd:cli",
      version === undefined ? "warning" : "ok",
      version === undefined
        ? `installed version is unsupported; requires ${MINIMUM_QMD_VERSION} or newer within major version 2`
        : `version ${version}`,
    ),
  ];
  if (version === undefined || localConfig === undefined) return checks;
  const collection = workspace.manifest.knowledge.qmd.collection;
  const result = run("qmd", ["collection", "show", collection], {
    allowFailure: true,
    cwd: workspace.root,
  });
  const collectionMatches =
    result.status === 0 &&
    qmdCollectionMatches(
      result.stdout,
      vault,
      qmdMask(workspace.manifest.knowledge.qmd.include),
    );
  const qmdSkill = path.join(
    workspace.root,
    ".agents",
    "skills",
    "qmd",
    "SKILL.md",
  );
  const contextResult = run("qmd", ["context", "list"], {
    allowFailure: true,
    cwd: workspace.root,
  });
  const contextMatches =
    contextResult.status === 0 &&
    qmdContextMatches(
      contextResult.stdout,
      collection,
      workspace.manifest.workspace.description,
    );
  const health = run("qmd", ["doctor"], {
    allowFailure: true,
    cwd: workspace.root,
  });
  const status = run("qmd", ["status"], {
    allowFailure: true,
    cwd: workspace.root,
  });
  checks.push(
    check(
      "qmd:collection",
      collectionMatches ? "ok" : "warning",
      collectionMatches
        ? collection
        : `missing or mismatched; run braingraph qmd configure ${workspace.root}`,
    ),
    artifactCheck("qmd:agent-skill", qmdSkill, "file", "warning"),
    check(
      "qmd:context",
      contextMatches ? "ok" : "warning",
      contextMatches
        ? workspace.manifest.workspace.description
        : `missing; run braingraph qmd configure ${workspace.root}`,
    ),
    check(
      "qmd:runtime-health",
      health.status === 0 ? "ok" : "warning",
      health.status === 0
        ? summarizeOutput(health.stdout, "QMD doctor passed")
        : summarizeOutput(health.stderr || health.stdout, "QMD doctor failed"),
    ),
    check(
      "qmd:index-status",
      status.status === 0 ? "ok" : "warning",
      summarizeOutput(status.stdout || status.stderr, "QMD status unavailable"),
    ),
  );
  return checks;
}

function softwareChecks(workspace: LoadedWorkspace): DoctorCheck[] {
  if (!workspace.manifest.workspace.profiles.includes("software")) return [];
  const gitInstalled = commandExists("git");
  const checks: DoctorCheck[] = [
    check(
      "git:cli",
      gitInstalled ? "ok" : "error",
      gitInstalled ? "installed" : "not found",
    ),
  ];
  let localState: LocalWorkspaceState;
  try {
    localState = loadLocalState(workspace.root);
  } catch (error: unknown) {
    checks.push(
      check(
        "repositories:local-state",
        "error",
        error instanceof Error ? error.message : String(error),
      ),
    );
    localState = { schemaVersion: 1, attachments: {} };
  }
  for (const [id, repository] of Object.entries(
    workspace.manifest.repositories,
  )) {
    checks.push(
      ...repositoryChecks(
        workspace.root,
        id,
        repository,
        localState,
        gitInstalled,
      ),
    );
  }
  return checks;
}

function repositoryChecks(
  workspaceRoot: string,
  id: string,
  repository: RepositoryConfig,
  localState: LocalWorkspaceState,
  gitInstalled: boolean,
): DoctorCheck[] {
  const hub = path.join(workspaceRoot, repository.path);
  const checks: DoctorCheck[] = [
    canonicalContainmentCheck(
      `repository:${id}:containment`,
      workspaceRoot,
      hub,
    ),
    artifactCheck(`repository:${id}:hub`, hub, "directory"),
    ...instructionScopeChecks(`repository:${id}`, hub),
  ];
  if (repository.mode === "attached") {
    checks.push(
      ...attachedRepositoryChecks(id, repository, localState, gitInstalled),
    );
    return checks;
  }

  const anchor = path.join(hub, ".bare");
  const stable = path.join(hub, repository.stableWorktree);
  const stableExists = isDirectory(stable);
  checks.push(
    artifactCheck(`repository:${id}:anchor`, anchor, "directory", "warning"),
    artifactCheck(
      `repository:${id}:stable-worktree`,
      stable,
      "directory",
      "warning",
    ),
  );
  if (!gitInstalled || !stableExists) return checks;

  const result = run(
    "git",
    ["-C", stable, "rev-parse", "--is-inside-work-tree"],
    { allowFailure: true },
  );
  checks.push(
    check(
      `repository:${id}:stable-worktree-git`,
      result.status === 0 && result.stdout.trim() === "true" ? "ok" : "error",
      stable,
    ),
  );
  return checks;
}

function attachedRepositoryChecks(
  id: string,
  repository: RepositoryConfig & { mode: "attached" },
  localState: LocalWorkspaceState,
  gitInstalled: boolean,
): DoctorCheck[] {
  const attachment = Object.entries(localState.attachments).find(
    ([attachmentId]) => attachmentId === id,
  )?.[1];
  if (attachment === undefined) {
    return [
      check(
        `repository:${id}:local-attachment`,
        "warning",
        "missing machine-local checkout mapping; rerun repo attach",
      ),
    ];
  }
  const checkout = attachment.checkoutPath;
  const checks = [
    artifactCheck(`repository:${id}:attached-checkout`, checkout, "directory"),
  ];
  if (!gitInstalled || !isDirectory(checkout)) return checks;
  const rootResult = run(
    "git",
    ["-C", checkout, "rev-parse", "--show-toplevel"],
    { allowFailure: true },
  );
  const originResult = run(
    "git",
    ["-C", checkout, "remote", "get-url", "origin"],
    { allowFailure: true },
  );
  checks.push(
    check(
      `repository:${id}:attached-git-root`,
      rootResult.status === 0 &&
        canonicalPath(rootResult.stdout.trim()) === canonicalPath(checkout)
        ? "ok"
        : "error",
      checkout,
    ),
    check(
      `repository:${id}:attached-origin`,
      originResult.status === 0 && originResult.stdout.trim() === repository.url
        ? "ok"
        : "error",
      repository.url,
    ),
  );
  if (attachment.bridge) {
    checks.push(
      artifactCheck(
        `repository:${id}:local-agents-bridge`,
        path.join(checkout, "AGENTS.md"),
        "file",
      ),
      artifactCheck(
        `repository:${id}:local-claude-bridge`,
        path.join(checkout, "CLAUDE.md"),
        "file",
      ),
    );
  } else {
    checks.push(
      check(
        `repository:${id}:local-agent-discovery`,
        "warning",
        "automatic checkout bridge disabled; existing repository instructions must point to the Braingraph workspace",
      ),
    );
  }
  return checks;
}

function writeSummary(
  workspaceRoot: string,
  checks: DoctorCheck[],
  output: OutputStream,
): void {
  output.write(`Braingraph doctor: ${workspaceRoot}\n`);
  for (const entry of checks)
    output.write(`  [${entry.status}] ${entry.name}: ${entry.detail}\n`);
}

function check(name: string, status: CheckStatus, detail: string): DoctorCheck {
  return { name, status, detail };
}

function qmdCollectionMatches(
  stdout: string,
  vault: string,
  mask: string,
): boolean {
  const pathMatch = /^\s*Path:\s+(.+)$/m.exec(stdout)?.[1]?.trim();
  const patternMatch = /^\s*Pattern:\s+(.+)$/m.exec(stdout)?.[1]?.trim();
  return (
    canonicalPath(pathMatch ?? "") === canonicalPath(vault) &&
    patternMatch === mask
  );
}

function qmdContextMatches(
  stdout: string,
  collection: string,
  description: string,
): boolean {
  const lines = stdout.split("\n");
  const collectionLine = lines.findIndex((line) => line === collection);
  if (collectionLine === -1) return false;
  const following = lines.slice(collectionLine + 1);
  const nextCollection = following.findIndex(
    (line) => line.length > 0 && !/^\s/.test(line),
  );
  const section =
    nextCollection === -1 ? following : following.slice(0, nextCollection);
  return section.some((line) => line.trim() === description.trim());
}

function canonicalPath(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function artifactCheck(
  name: string,
  candidate: string,
  expected: "file" | "directory",
  missingStatus: CheckStatus = "error",
): DoctorCheck {
  const matches =
    expected === "file" ? isFile(candidate) : isDirectory(candidate);
  if (matches) return check(name, "ok", candidate);
  const exists = fs.existsSync(candidate);
  return check(
    name,
    exists ? "error" : missingStatus,
    exists
      ? `expected ${expected}: ${candidate}`
      : `missing ${expected}: ${candidate}`,
  );
}

function canonicalContainmentCheck(
  name: string,
  root: string,
  candidate: string,
): DoctorCheck {
  try {
    assertCanonicalPathInside(root, candidate, name);
    return check(name, "ok", candidate);
  } catch (error: unknown) {
    return check(
      name,
      "error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function summarizeOutput(value: string, fallback: string): string {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
  return lines.length > 0 ? lines.join("; ") : fallback;
}
