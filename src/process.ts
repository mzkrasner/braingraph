import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { ProcessOptions, ProcessResult } from "./types.js";

/** Runs a subprocess synchronously and normalizes its captured result. */
export function run(
  command: string,
  args: readonly string[],
  options: ProcessOptions = {},
): ProcessResult {
  const invocation = resolveCommandInvocation(
    command,
    args,
    process.platform,
    options.env ?? process.env,
  );
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe",
  };
  if (options.cwd !== undefined) {
    spawnOptions.cwd = options.cwd;
  }
  const result = spawnSync(invocation.command, invocation.args, spawnOptions);

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`,
    );
  }

  return {
    status: result.status ?? 1,
    stdout: normalizeCapturedText(result.stdout),
    stderr: normalizeCapturedText(result.stderr),
  };
}

function normalizeCapturedText(value: string | null): string {
  return (value ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/** Checks whether an executable can be resolved on the current PATH. */
export function commandExists(
  command: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return findExecutable(command, platform, environment) !== null;
}

export interface ProcessInvocation {
  command: string;
  args: readonly string[];
}

/** Resolves a command without treating its name or arguments as shell source. */
export function resolveCommandInvocation(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): ProcessInvocation {
  if (platform !== "win32") return { command, args };
  const executable = findExecutable(command, "win32", environment);
  if (executable === null) return { command, args };
  const extension = path.extname(executable).toLowerCase();
  if (extension !== ".cmd" && extension !== ".bat") {
    return { command: executable, args };
  }

  const powerShellShim = `${executable.slice(0, -extension.length)}.ps1`;
  if (!isExecutable(powerShellShim, "win32")) {
    throw new Error(
      `cannot safely execute Windows command shim without a PowerShell companion: ${executable}`,
    );
  }
  const powerShell =
    findExecutable("powershell.exe", "win32", environment) ??
    findExecutable("pwsh.exe", "win32", environment);
  if (powerShell === null) {
    throw new Error(
      `PowerShell is required to safely execute Windows command shim: ${executable}`,
    );
  }
  return {
    command: powerShell,
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      powerShellShim,
      ...args,
    ],
  };
}

function findExecutable(
  command: string,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string | null {
  if (command.length === 0 || /[\0\r\n]/.test(command)) return null;
  const extensions = executableExtensions(command, platform, environment);
  const hasPathSeparator = command.includes("/") || command.includes("\\");
  const directories = hasPathSeparator
    ? [""]
    : (environmentValue(environment, "PATH") ?? "")
        .split(path.delimiter)
        .filter(Boolean);
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = directory ? path.join(directory, command) : command;
      const executable = `${candidate}${extension}`;
      if (isExecutable(executable, platform)) return executable;
    }
  }
  return null;
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

function executableExtensions(
  command: string,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string[] {
  if (platform !== "win32" || path.extname(command).length > 0) return [""];
  const configured =
    environmentValue(environment, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD";
  return configured
    .split(";")
    .filter(Boolean)
    .map((extension) =>
      extension.startsWith(".") ? extension : `.${extension}`,
    );
}

function environmentValue(
  environment: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const entry = Object.entries(environment).find(
    ([candidate]) => candidate.toUpperCase() === key,
  );
  return entry?.[1];
}

function isExecutable(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    if (platform !== "win32") fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
