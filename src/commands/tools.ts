import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
import { commandExists, displayCommand, run } from "../process.js";
import type { CommandContext } from "../types.js";

interface CommandInstallAction {
  kind: "command";
  command: string;
  args: string[];
  label: string;
}

interface ManualInstallAction {
  kind: "manual";
  label: string;
  instructions: string;
}

type InstallAction = CommandInstallAction | ManualInstallAction;

interface ObsidianDetectionOptions {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  localAppData?: string;
  exists?: (candidate: string) => boolean;
  commandAvailable?: (command: string) => boolean;
}

export const TOOLS_HELP = `Usage:
  braingraph tools install [directory] [--dry-run | --execute]

Installs the Obsidian desktop application and QMD CLI when missing. Installation
is never implicit: inspect with --dry-run, then repeat with --execute.`;

/** Plans or performs installation of Braingraph's default local tools. */
export function toolsInstallCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["dry-run", "execute", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${TOOLS_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("tools install accepts at most one directory");
  const dryRun = booleanOption(options, "dry-run");
  const execute = booleanOption(options, "execute");
  requireInstallMode(dryRun, execute);
  const actions = installActions();

  if (actions.length === 0) {
    output.write("Obsidian and QMD are already installed.\n");
    return 0;
  }

  for (const action of actions) {
    applyInstallAction(action, dryRun, execute, output);
  }
  return 0;
}

function requireInstallMode(dryRun: boolean, execute: boolean): void {
  if (!dryRun && !execute) {
    throw new UsageError("tools install requires --dry-run or --execute");
  }
}

function installActions(): InstallAction[] {
  const actions: InstallAction[] = [];
  if (!isObsidianInstalled()) actions.push(resolveObsidianInstallAction());
  if (!commandExists("qmd")) actions.push(qmdInstallAction());
  return actions;
}

function qmdInstallAction(): CommandInstallAction {
  if (!commandExists("npm")) {
    throw new UsageError("npm is required to install QMD");
  }
  return {
    kind: "command",
    command: "npm",
    args: ["install", "-g", "@tobilu/qmd"],
    label: "QMD",
  };
}

function applyInstallAction(
  action: InstallAction,
  dryRun: boolean,
  execute: boolean,
  output: CommandContext["output"],
): void {
  const writer = output ?? process.stdout;
  if (action.kind === "manual") {
    writer.write(
      `${dryRun ? "[dry-run] " : ""}install ${action.label}: ${action.instructions}\n`,
    );
    if (execute) throw new UsageError(action.instructions);
    return;
  }
  writer.write(
    `${dryRun ? "[dry-run] " : ""}install ${action.label}: ${displayCommand(action.command, action.args)}\n`,
  );
  if (execute) run(action.command, action.args, { stdio: "inherit" });
}

/** Detects whether the Obsidian application is available locally. */
export function isObsidianInstalled(
  options: ObsidianDetectionOptions = {},
): boolean {
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? fs.existsSync;
  const commandAvailable = options.commandAvailable ?? commandExists;
  if (platform === "darwin") {
    return (
      exists("/Applications/Obsidian.app") ||
      exists(
        path.join(
          options.homeDirectory ?? os.homedir(),
          "Applications",
          "Obsidian.app",
        ),
      )
    );
  }
  if (platform === "win32") {
    const localAppData = options.localAppData ?? process.env.LOCALAPPDATA;
    return (
      commandAvailable("obsidian") ||
      Boolean(
        localAppData &&
        exists(path.join(localAppData, "Obsidian", "Obsidian.exe")),
      )
    );
  }
  return commandAvailable("obsidian") || commandAvailable("obsidian-appimage");
}

/** Resolves automatic or manual Obsidian installation guidance by platform. */
export function resolveObsidianInstallAction(
  platform: NodeJS.Platform = process.platform,
  commandAvailable: (command: string) => boolean = commandExists,
): InstallAction {
  if (platform === "darwin") {
    if (!commandAvailable("brew")) {
      return manualObsidianAction(
        "install Homebrew or download Obsidian from https://obsidian.md/download",
      );
    }
    return {
      kind: "command",
      command: "brew",
      args: ["install", "--cask", "obsidian"],
      label: "Obsidian",
    };
  }
  if (platform === "win32") {
    if (!commandAvailable("winget")) {
      return manualObsidianAction(
        "install winget or download Obsidian from https://obsidian.md/download",
      );
    }
    return {
      kind: "command",
      command: "winget",
      args: ["install", "--id", "Obsidian.Obsidian", "--exact"],
      label: "Obsidian",
    };
  }
  return manualObsidianAction(
    "install an official Linux package from https://obsidian.md/download",
  );
}

function manualObsidianAction(instructions: string): ManualInstallAction {
  return {
    kind: "manual",
    label: "Obsidian",
    instructions,
  };
}
