import fs from "node:fs";
import path from "node:path";

import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
import { loadWorkspace } from "../manifest.js";
import { commandExists, displayCommand, run } from "../process.js";
import { qmdMask } from "../templates.js";
import type { CommandContext, OutputStream, ProcessOptions } from "../types.js";

export const QMD_HELP = `Usage:
  braingraph qmd configure [directory] [--no-embed] [--dry-run]
  braingraph qmd refresh [directory] [--embed] [--dry-run]

configure registers the vault collection, installs QMD's canonical agent skill into
the workspace .agents/skills catalog, adds or updates workspace-purpose context,
indexes Markdown, and embeds by default. refresh updates the index and embeds only
when --embed is supplied.
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
  const dryRun = booleanOption(options, "dry-run");
  const qmdAvailable = commandExists("qmd");
  if (!dryRun && !qmdAvailable) ensureQmd();
  const embed = booleanOption(options, "embed", true);
  const qmd = workspace.manifest.knowledge.qmd;
  const vault = path.join(
    workspace.root,
    workspace.manifest.knowledge.directory,
  );
  const mask = qmdMask(qmd.include);

  const existing = qmdAvailable
    ? run("qmd", ["collection", "show", qmd.collection], {
        allowFailure: true,
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
  );
  executeOrPrint("qmd", ["skill", "install"], dryRun, output, workspace.root);
  executeOrPrint("qmd", ["update"], dryRun, output);
  if (embed)
    executeOrPrint("qmd", ["embed", "-c", qmd.collection], dryRun, output);
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
  const dryRun = booleanOption(options, "dry-run");
  if (!dryRun) ensureQmd();
  executeOrPrint("qmd", ["update"], dryRun, output);
  if (booleanOption(options, "embed")) {
    executeOrPrint(
      "qmd",
      ["embed", "-c", workspace.manifest.knowledge.qmd.collection],
      dryRun,
      output,
    );
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
