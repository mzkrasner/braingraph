import fs from "node:fs";
import path from "node:path";

import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
import { loadWorkspace, validateManifest } from "../manifest.js";
import { commandExists, run } from "../process.js";
import { qmdMask } from "../templates.js";
import type {
  CommandContext,
  LoadedWorkspace,
  OutputStream,
} from "../types.js";

import { isObsidianInstalled } from "./tools.js";

type CheckStatus = "ok" | "warning" | "error";

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
    ...vaultChecks(vault),
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
  return check(
    "manifest",
    errors.length === 0 ? "ok" : "error",
    errors.join("; ") || "schema version 1",
  );
}

function vaultChecks(vault: string): DoctorCheck[] {
  const relativePaths = [
    "../AGENTS.md",
    "../schemas/braingraph-workspace.schema.json",
    "AGENTS.md",
    "Start Here.md",
    "index.md",
    "projects",
    "domains",
    "wiki",
    "raw",
    "sources",
    "reports",
    ".obsidian/app.json",
    ".obsidian/templates.json",
  ];
  return relativePaths.map((relative) => {
    const target = path.join(vault, relative);
    return check(
      `vault:${relative}`,
      fs.existsSync(target) ? "ok" : "error",
      target,
    );
  });
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
    const hub = path.join(workspace.root, repository.path);
    checks.push(
      check(`repository:${id}:hub`, fs.existsSync(hub) ? "ok" : "error", hub),
    );
    const anchor = path.join(hub, ".bare");
    checks.push(
      check(
        `repository:${id}:anchor`,
        fs.existsSync(anchor) ? "ok" : "warning",
        anchor,
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

function canonicalPath(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}
