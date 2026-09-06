import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import { resolveCommandInvocation } from "./process.js";
import type { ProcessOptions, ProcessResult } from "./types.js";

interface BoundedOptions extends ProcessOptions {
  timeoutMs: number;
}

/** Runs a bounded child process, stopping its process tree on timeout or cancellation. */
export function runBounded(
  command: string,
  args: readonly string[],
  options: BoundedOptions,
): Promise<ProcessResult> {
  const environment = options.env ?? process.env;
  const invocation = resolveCommandInvocation(
    command,
    args,
    process.platform,
    environment,
  );
  const child = spawn(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: environment,
    stdio: options.stdio ?? "pipe",
    detached: process.platform !== "win32",
  });
  return observeChild(child, command, options);
}

function observeChild(
  child: ChildProcess,
  command: string,
  options: BoundedOptions,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    const stop = (message: string): void => {
      failure ??= new Error(message);
      stopProcessTree(child);
    };
    const interrupt = (): void => {
      stop(`${command} cancelled`);
    };
    const timer = setTimeout(() => {
      stop(`${command} timed out after ${String(options.timeoutMs)} ms`);
    }, options.timeoutMs);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 1_000_000) stop(`${command} output exceeded 1 MB`);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 1_000_000) stop(`${command} output exceeded 1 MB`);
    });
    child.on("error", (error: Error) => {
      failure = error;
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
      if (failure !== undefined) {
        reject(failure);
        return;
      }
      if (status !== 0 && !options.allowFailure) {
        reject(
          new Error(
            `${command} failed: ${(stderr || stdout).trim() || String(status)}`,
          ),
        );
        return;
      }
      resolve({
        status: status ?? 1,
        stdout: normalize(stdout),
        stderr: normalize(stderr),
      });
    });
  });
}

function stopProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    // npm's PowerShell launcher may have a Node descendant; stopping only the shim is unsafe.
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5_000,
    });
    child.kill("SIGKILL");
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ESRCH"
    ) {
      child.kill("SIGKILL");
    }
  }
}

function normalize(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}
