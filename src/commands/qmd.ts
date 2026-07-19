import fs from "node:fs";
import path from "node:path";

import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
import { loadWorkspace } from "../manifest.js";
import { commandExists, displayCommand, run } from "../process.js";
import { qmdMask } from "../templates.js";
import type { CommandContext, OutputStream, ProcessOptions } from "../types.js";
import { assertCanonicalPathInside } from "../util.js";

export const MINIMUM_QMD_VERSION = "2.5.3";
const SUPPORTED_QMD_MAJOR = 2;

export const QMD_HELP = `Usage:
  braingraph qmd configure [directory] [--no-embed] [--dry-run]
  braingraph qmd refresh [directory] [--embed] [--dry-run]

configure creates a workspace-local QMD index, registers the vault collection,
installs QMD's canonical agent skill into the workspace .agents/skills catalog,
adds or updates workspace-purpose context, indexes Markdown, and embeds by default.
refresh updates only that local index and embeds only when --embed is supplied.
Dry runs remain available before QMD is installed.`;

/** Registers and initially indexes the configured QMD collection. */
export function qmdConfigureCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["embed", "dry-run", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${QMD_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("qmd configure accepts at most one directory");
  const workspace = loadWorkspace(positionals[0] ?? process.cwd());
  assertQmdDestinations(workspace.root, true);
  const dryRun = booleanOption(options, "dry-run");
  const qmdAvailable = commandExists("qmd");
  if (!dryRun && !qmdAvailable) ensureQmd();
  if (qmdAvailable) assertSupportedQmdVersion(workspace.root);
  const embed = booleanOption(options, "embed", true);
  const qmd = workspace.manifest.knowledge.qmd;
  const vault = path.join(
    workspace.root,
    workspace.manifest.knowledge.directory,
  );
  const mask = qmdMask(qmd.include);
  const hasLocalIndex = localQmdConfig(workspace.root) !== undefined;
  if (!hasLocalIndex) {
    executeOrPrint("qmd", ["init"], dryRun, output, workspace.root);
  }

  const existing =
    qmdAvailable && hasLocalIndex
      ? run("qmd", ["collection", "show", qmd.collection], {
          allowFailure: true,
          cwd: workspace.root,
        })
      : undefined;
  if (existing?.status === 0) {
    assertMatchingCollection(existing.stdout, vault, mask, qmd.collection);
    output.write(`QMD collection already matches: ${qmd.collection}\n`);
  } else {
    executeOrPrint(
      "qmd",
      ["collection", "add", vault, "--name", qmd.collection, "--mask", mask],
      dryRun,
      output,
      workspace.root,
    );
  }

  executeOrPrint(
    "qmd",
    [
      "context",
      "add",
      `qmd://${qmd.collection}`,
      workspace.manifest.workspace.description,
    ],
    dryRun,
    output,
    workspace.root,
  );
  ensureQmdSkill(workspace.root, dryRun, output);
  executeOrPrint("qmd", ["update"], dryRun, output, workspace.root);
  if (embed)
    executeOrPrint(
      "qmd",
      ["embed", "-c", qmd.collection],
      dryRun,
      output,
      workspace.root,
    );
  return 0;
}

/** Refreshes an existing QMD index and optionally its embeddings. */
export function qmdRefreshCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["embed", "dry-run", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${QMD_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("qmd refresh accepts at most one directory");
  const workspace = loadWorkspace(positionals[0] ?? process.cwd());
  assertQmdDestinations(workspace.root, false);
  const dryRun = booleanOption(options, "dry-run");
  if (!dryRun) ensureQmd();
  if (commandExists("qmd")) assertSupportedQmdVersion(workspace.root);
  if (localQmdConfig(workspace.root) === undefined) {
    throw new UsageError(
      "workspace-local QMD index is not configured; run braingraph qmd configure first",
    );
  }
  executeOrPrint("qmd", ["update"], dryRun, output, workspace.root);
  if (booleanOption(options, "embed")) {
    executeOrPrint(
      "qmd",
      ["embed", "-c", workspace.manifest.knowledge.qmd.collection],
      dryRun,
      output,
      workspace.root,
    );
  }
  return 0;
}

/** Returns the installed QMD version when it satisfies Braingraph's contract. */
export function supportedQmdVersion(cwd: string): string | undefined {
  if (!commandExists("qmd")) return undefined;
  const result = run("qmd", ["--version"], { allowFailure: true, cwd });
  if (result.status !== 0) return undefined;
  const match = /qmd\s+(\d+)\.(\d+)\.(\d+)/i.exec(result.stdout);
  if (match === null) return undefined;
  const version = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ] as const;
  if (
    version[0] !== SUPPORTED_QMD_MAJOR ||
    compareVersion(version, parseVersion(MINIMUM_QMD_VERSION)) < 0
  ) {
    return undefined;
  }
  return version.join(".");
}

function assertSupportedQmdVersion(cwd: string): void {
  if (supportedQmdVersion(cwd) === undefined) {
    throw new UsageError(
      `QMD ${MINIMUM_QMD_VERSION} or newer within major version ${String(SUPPORTED_QMD_MAJOR)} is required`,
    );
  }
}

function localQmdConfig(workspaceRoot: string): string | undefined {
  return ["index.yml", "index.yaml"]
    .map((name) => path.join(workspaceRoot, ".qmd", name))
    .find((candidate) => fs.existsSync(candidate));
}

function ensureQmdSkill(
  workspaceRoot: string,
  dryRun: boolean,
  output: OutputStream,
): void {
  const skill = path.join(
    workspaceRoot,
    ".agents",
    "skills",
    "qmd",
    "SKILL.md",
  );
  if (fs.existsSync(skill)) {
    if (!fs.statSync(skill).isFile()) {
      throw new UsageError(`QMD skill path is not a file: ${skill}`);
    }
    const content = fs.readFileSync(skill, "utf8");
    if (
      !/^name:\s*qmd$/m.test(content) ||
      !content.includes("qmd skill show")
    ) {
      throw new UsageError(
        `existing QMD skill is not the expected version-matched bootstrap: ${skill}`,
      );
    }
    output.write(`QMD skill already matches: ${skill}\n`);
    return;
  }
  output.write(
    `${dryRun ? "[dry-run] " : ""}${displayCommand("qmd", ["skill", "install"])}\n`,
  );
  if (dryRun) return;
  const result = run("qmd", ["skill", "install"], {
    cwd: workspaceRoot,
    allowFailure: true,
  });
  output.write(result.stdout);
  if (result.status !== 0) {
    throw new UsageError(
      result.stderr.trim() || "QMD skill installation failed",
    );
  }
}

function parseVersion(value: string): readonly [number, number, number] {
  const parts = value.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareVersion(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (const [index, leftPart] of left.entries()) {
    const difference = leftPart - (right.at(index) ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function ensureQmd(): void {
  if (!commandExists("qmd"))
    throw new UsageError(
      "QMD is not installed; run braingraph tools install --dry-run first",
    );
}

function executeOrPrint(
  command: string,
  args: readonly string[],
  dryRun: boolean,
  output: OutputStream,
  cwd?: string,
): void {
  output.write(
    `${dryRun ? "[dry-run] " : ""}${displayCommand(command, args)}\n`,
  );
  if (!dryRun) {
    const processOptions: ProcessOptions = { stdio: "inherit" };
    if (cwd !== undefined) processOptions.cwd = cwd;
    run(command, args, processOptions);
  }
}

function assertMatchingCollection(
  stdout: string,
  vault: string,
  mask: string,
  collection: string,
): void {
  const pathMatch = /^\s*Path:\s+(.+)$/m.exec(stdout)?.[1]?.trim();
  const patternMatch = /^\s*Pattern:\s+(.+)$/m.exec(stdout)?.[1]?.trim();
  if (
    canonicalPath(pathMatch ?? "") !== canonicalPath(vault) ||
    patternMatch !== mask
  ) {
    throw new UsageError(
      `QMD collection ${collection} already exists with a different path or mask; inspect it before changing local index state`,
    );
  }
}

function canonicalPath(value: string): string {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function assertQmdDestinations(
  workspaceRoot: string,
  includeSkill: boolean,
): void {
  assertCanonicalPathInside(
    workspaceRoot,
    path.join(workspaceRoot, ".qmd"),
    "QMD workspace state",
  );
  for (const name of ["index.yml", "index.yaml"]) {
    assertCanonicalPathInside(
      workspaceRoot,
      path.join(workspaceRoot, ".qmd", name),
      "QMD index destination",
    );
  }
  if (includeSkill) {
    assertCanonicalPathInside(
      workspaceRoot,
      path.join(workspaceRoot, ".agents", "skills", "qmd", "SKILL.md"),
      "QMD skill destination",
    );
  }
}
