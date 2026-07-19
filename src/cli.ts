import { doctorCommand, DOCTOR_HELP } from "./commands/doctor.js";
import { initCommand, INIT_HELP } from "./commands/init.js";
import { obsidianOpenCommand, OBSIDIAN_HELP } from "./commands/obsidian.js";
import {
  qmdConfigureCommand,
  qmdRefreshCommand,
  QMD_HELP,
} from "./commands/qmd.js";
import {
  repoAddCommand,
  repoAttachCommand,
  repoRemoveCommand,
  REPO_HELP,
} from "./commands/repo.js";
import {
  systemAddCommand,
  systemUpdateCommand,
  SYSTEM_HELP,
} from "./commands/system.js";
import { toolsInstallCommand, TOOLS_HELP } from "./commands/tools.js";
import {
  worktreeInspectCommand,
  worktreeNewCommand,
  worktreeRemoveCommand,
  WORKTREE_HELP,
} from "./commands/worktree.js";
import { UsageError } from "./errors.js";
import type { CommandContext, OutputStream } from "./types.js";

type CommandResult = number | Promise<number>;
type CommandHandler = (
  args: readonly string[],
  context: CommandContext,
) => CommandResult;

const HELP = `Braingraph - agent-first second-brain workspace scaffolding

Usage:
  braingraph init [directory] [options]
  braingraph doctor [directory] [--json]
  braingraph tools install [directory] [options]
  braingraph obsidian open [directory] [options]
  braingraph qmd configure|refresh [directory] [options]
  braingraph system add|update <id> [options]
  braingraph repo add|attach|remove <id> [options]
  braingraph worktree new|inspect|remove <repository> <name> [options]

Run braingraph <command> --help for command details.`;

const TOP_LEVEL_COMMANDS = new Map<string, CommandHandler>([
  ["init", initCommand],
  ["doctor", doctorCommand],
]);

const NESTED_COMMANDS = new Map<string, CommandHandler>([
  ["tools install", toolsInstallCommand],
  ["obsidian open", obsidianOpenCommand],
  ["qmd configure", qmdConfigureCommand],
  ["qmd refresh", qmdRefreshCommand],
  ["system add", systemAddCommand],
  ["system update", systemUpdateCommand],
  ["repo add", repoAddCommand],
  ["repo attach", repoAttachCommand],
  ["repo remove", repoRemoveCommand],
  ["worktree new", worktreeNewCommand],
  ["worktree inspect", worktreeInspectCommand],
  ["worktree remove", worktreeRemoveCommand],
]);

const COMMAND_HELP = new Map<string, string>([
  ["init", INIT_HELP],
  ["doctor", DOCTOR_HELP],
  ["tools", TOOLS_HELP],
  ["obsidian", OBSIDIAN_HELP],
  ["qmd", QMD_HELP],
  ["system", SYSTEM_HELP],
  ["repo", REPO_HELP],
  ["worktree", WORKTREE_HELP],
]);

/** Runs one Braingraph CLI invocation and returns its process exit code. */
export async function main(
  args: readonly string[],
  context: CommandContext = {},
): Promise<number> {
  const output = context.output ?? process.stdout;
  const errorOutput = context.errorOutput ?? process.stderr;
  if (isHelpRequest(args)) {
    output.write(`${HELP}\n`);
    return 0;
  }

  try {
    return await dispatch(args, context);
  } catch (error: unknown) {
    if (!(error instanceof UsageError)) throw error;
    errorOutput.write(`braingraph: ${error.message}\n`);
    writeCommandHelp(args[0], errorOutput);
    return 2;
  }
}

function isHelpRequest(args: readonly string[]): boolean {
  return args.length === 0 || args[0] === "--help" || args[0] === "-h";
}

async function dispatch(
  args: readonly string[],
  context: CommandContext,
): Promise<number> {
  const command = args[0];
  if (command === undefined) {
    throw new UsageError("a command is required");
  }

  const topLevelHandler = TOP_LEVEL_COMMANDS.get(command);
  if (topLevelHandler !== undefined) {
    return await topLevelHandler(args.slice(1), context);
  }

  const subcommand = args[1];
  const nestedHandler =
    subcommand === undefined
      ? undefined
      : NESTED_COMMANDS.get(`${command} ${subcommand}`);
  if (nestedHandler === undefined) {
    throw new UsageError(`unknown command: ${args.join(" ")}`);
  }
  return await nestedHandler(args.slice(2), context);
}

function writeCommandHelp(
  command: string | undefined,
  errorOutput: OutputStream,
): void {
  if (command === undefined) return;
  const help = COMMAND_HELP.get(command);
  if (help !== undefined) errorOutput.write(`${help}\n`);
}
