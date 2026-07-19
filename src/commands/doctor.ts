import fs from "node:fs";
import path from "node:path";

import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
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
  OutputStream,
} from "../types.js";

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
    ...vaultChecks(vault),
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

function vaultChecks(vault: string): DoctorCheck[] {
  const relativePaths = [
    "../schemas/braingraph-workspace.schema.json",
    "Start Here.md",
    "index.md",
    "log.md",
    "projects",
    "domains",
    "wiki",
    "raw",
    "raw/README.md",
    "raw/processed",
    "raw/attachments",
    "sources",
    "sources/Processing ledger.md",
    "reports",
    "evals/retrieval/README.md",
    "_templates/Project.md",
    "_templates/Domain.md",
    "_templates/Knowledge.md",
    "_templates/Source.md",
    "_templates/Report.md",
    ".gitignore",
    ".obsidian/app.json",
    ".obsidian/core-plugins.json",
    ".obsidian/templates.json",
  ];
  const checks = [
    ...instructionScopeChecks("knowledge", vault),
    ...relativePaths.map((relative) => {
      const target = path.join(vault, relative);
      return check(
        `vault:${relative}`,
        fs.existsSync(target) ? "ok" : "error",
        target,
      );
    }),
  ];
  checks.push(...placeholderChecks(vault));
  return checks;
}

function placeholderChecks(vault: string): DoctorCheck[] {
  const files: readonly (readonly [string, string])[] = [
    ["root-instructions", path.resolve(vault, "..", "AGENTS.md")],
    ["vault-instructions", path.join(vault, "AGENTS.md")],
    ["start-here", path.join(vault, "Start Here.md")],
  ];
  return files.flatMap(([label, file]) => {
    if (!isFile(file)) return [];
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
  const canonicalDirectory = path.join(workspaceRoot, ".agents", "skills");
  const canonicalSkills = skillNames(canonicalDirectory);
  if (canonicalSkills.length === 0) return [];

  const duplicates = VENDOR_SKILL_DIRECTORIES.flatMap((relative) => {
    const mirrored = new Set(skillNames(path.join(workspaceRoot, relative)));
    return canonicalSkills
      .filter((name) => mirrored.has(name))
      .map((name) => `${relative}/${name}`);
  });
  return [
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
  if (!commandExists("qmd")) {
    return [
      check(
        "qmd:cli",
        "warning",
        "not installed; run braingraph tools install --dry-run",
      ),
    ];
  }
  const collection = workspace.manifest.knowledge.qmd.collection;
  const result = run("qmd", ["collection", "show", collection], {
    allowFailure: true,
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
  });
  const contextMatches =
    contextResult.status === 0 &&
    qmdContextMatches(
      contextResult.stdout,
      collection,
      workspace.manifest.workspace.description,
    );
  return [
    check("qmd:cli", "ok", "installed"),
    check(
      "qmd:collection",
      collectionMatches ? "ok" : "warning",
      collectionMatches
        ? collection
        : `missing or mismatched; run braingraph qmd configure ${workspace.root}`,
    ),
    check(
      "qmd:agent-skill",
      fs.existsSync(qmdSkill) ? "ok" : "warning",
      qmdSkill,
    ),
    check(
      "qmd:context",
      contextMatches ? "ok" : "warning",
      contextMatches
        ? workspace.manifest.workspace.description
        : `missing; run braingraph qmd configure ${workspace.root}`,
    ),
  ];
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
  for (const [id, repository] of Object.entries(
    workspace.manifest.repositories,
  )) {
    checks.push(
      ...repositoryChecks(workspace.root, id, repository, gitInstalled),
    );
  }
  return checks;
}

function repositoryChecks(
  workspaceRoot: string,
  id: string,
  repository: LoadedWorkspace["manifest"]["repositories"][string],
  gitInstalled: boolean,
): DoctorCheck[] {
  const hub = path.join(workspaceRoot, repository.path);
  const anchor = path.join(hub, ".bare");
  const stable = path.join(hub, repository.stableWorktree);
  const stableExists = fs.existsSync(stable);
  const checks = [
    check(`repository:${id}:hub`, fs.existsSync(hub) ? "ok" : "error", hub),
    check(
      `repository:${id}:anchor`,
      fs.existsSync(anchor) ? "ok" : "warning",
      anchor,
    ),
    ...instructionScopeChecks(`repository:${id}`, hub),
    check(
      `repository:${id}:stable-worktree`,
      stableExists ? "ok" : "warning",
      stable,
    ),
  ];
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
