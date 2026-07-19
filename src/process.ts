import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";

import type { ProcessOptions, ProcessResult } from "./types.js";

/** Runs a subprocess synchronously and normalizes its captured result. */
export function run(
  command: string,
  args: readonly string[],
  options: ProcessOptions = {},
): ProcessResult {
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe",
  };
  if (options.cwd !== undefined) {
    spawnOptions.cwd = options.cwd;
  }
  const result = spawnSync(command, args, spawnOptions);

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Checks whether an executable can be resolved on the current PATH. */
export function commandExists(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const isWindows = platform === "win32";
  const checker = isWindows ? "where" : "command";
  const args = isWindows ? [command] : ["-v", command];
  const shell = !isWindows;
  const result = spawnSync(checker, args, {
    encoding: "utf8",
    shell,
    stdio: "ignore",
  });
  return result.status === 0;
}

/** Formats a command for reviewable dry-run output. */
export function displayCommand(
  command: string,
  args: readonly string[],
): string {
  return [command, ...args].map(quoteArgument).join(" ");
}

function quoteArgument(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
