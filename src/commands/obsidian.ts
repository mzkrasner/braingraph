import path from "node:path";

import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
import { loadWorkspace } from "../manifest.js";
import { displayCommand, run } from "../process.js";
import type { CommandContext } from "../types.js";

import { isObsidianInstalled } from "./tools.js";

interface OpenAction {
  command: string;
  args: string[];
}

export const OBSIDIAN_HELP = `Usage:
  braingraph obsidian open [directory] [--dry-run | --execute]

Opens the generated Start Here note through the official obsidian:// URI. Opening
the vault is an external GUI action and requires --dry-run or --execute.`;

/** Opens the generated Start Here note through an explicit platform action. */
export function obsidianOpenCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["dry-run", "execute", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${OBSIDIAN_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("obsidian open accepts at most one directory");
  const dryRun = booleanOption(options, "dry-run");
  const execute = booleanOption(options, "execute");
  if (dryRun === execute)
    throw new UsageError(
      "obsidian open requires exactly one of --dry-run or --execute",
    );
  if (execute && !isObsidianInstalled())
    throw new UsageError(
      "Obsidian is not installed; run braingraph tools install --dry-run first",
    );

  const workspace = loadWorkspace(positionals[0] ?? process.cwd());
  const startHere = path.join(
    workspace.root,
    workspace.manifest.knowledge.directory,
    "Start Here.md",
  );
  const uri = `obsidian://open?path=${encodeURIComponent(startHere)}`;
  const action = platformOpenAction(uri);
  output.write(
    `${dryRun ? "[dry-run] " : ""}${displayCommand(action.command, action.args)}\n`,
  );
  if (execute) run(action.command, action.args, { stdio: "ignore" });
  return 0;
}

/** Resolves the platform command used to open an Obsidian URI. */
export function platformOpenAction(
  uri: string,
  platform: NodeJS.Platform = process.platform,
): OpenAction {
  if (platform === "darwin") return { command: "open", args: [uri] };
  if (platform === "win32")
    return { command: "cmd", args: ["/c", "start", "", uri] };
  return { command: "xdg-open", args: [uri] };
}
