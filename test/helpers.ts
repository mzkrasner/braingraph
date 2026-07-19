import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { main } from "../src/cli.js";
import { validateManifest } from "../src/manifest.js";
import type { OutputStream, WorkspaceManifest } from "../src/types.js";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
interface RunCliOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface GitFixture {
  root: string;
  remote: string;
}

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface TextCapture {
  output: OutputStream;
  read(): string;
}

/**
 *
 */
export function temporaryDirectory(prefix = "braingraph-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 *
 */
export function runCli(
  args: readonly string[],
  options: RunCliOptions = {},
): Promise<CliResult> {
  return runCliIsolated(args, options);
}

/**
 *
 */
export function runGit(args: readonly string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

/**
 *
 */
export function createRemoteWithBranch(branch = "dev"): GitFixture {
  const root = temporaryDirectory("braingraph-git-");
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  runGit(["init", "--bare", remote], root);
  fs.mkdirSync(seed);
  runGit(["init"], seed);
  runGit(["config", "user.name", "Synthetic Tester"], seed);
  runGit(["config", "user.email", "synthetic@example.invalid"], seed);
  runGit(["config", "commit.gpgSign", "false"], seed);
  fs.writeFileSync(
    path.join(seed, "README.md"),
    "# Synthetic repository\n",
    "utf8",
  );
  runGit(["add", "README.md"], seed);
  runGit(["commit", "-m", "chore: initialize synthetic fixture"], seed);
  runGit(["branch", "-M", branch], seed);
  runGit(["remote", "add", "origin", remote], seed);
  runGit(["push", "-u", "origin", branch], seed);
  return { root, remote };
}

export function readWorkspaceManifest(workspace: string): WorkspaceManifest {
  const value = parseJson(
    fs.readFileSync(path.join(workspace, "braingraph.json"), "utf8"),
  );
  const errors = validateManifest(value);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return value as WorkspaceManifest;
}

export function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = parseJson(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

async function runCliIsolated(
  args: readonly string[],
  options: RunCliOptions,
): Promise<CliResult> {
  const standardOutput = createTextCapture();
  const errorOutput = createTextCapture();
  const originalDirectory = process.cwd();
  const originalEnvironment = applyEnvironment(options.env);
  try {
    process.chdir(options.cwd ?? repositoryRoot);
    const status = await main(args, {
      output: standardOutput.output,
      errorOutput: errorOutput.output,
    });
    return {
      status,
      stdout: standardOutput.read(),
      stderr: errorOutput.read(),
    };
  } catch (error: unknown) {
    errorOutput.output.write(
      `braingraph: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return {
      status: 1,
      stdout: standardOutput.read(),
      stderr: errorOutput.read(),
    };
  } finally {
    process.chdir(originalDirectory);
    restoreEnvironment(originalEnvironment);
  }
}

function createTextCapture(): TextCapture {
  let content = "";
  return {
    output: {
      write(value: string): void {
        content += value;
      },
    },
    read(): string {
      return content;
    },
  };
}

function applyEnvironment(
  environment: NodeJS.ProcessEnv | undefined,
): Map<string, string | undefined> {
  const original = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(environment ?? {})) {
    const previous = Reflect.get(process.env, key);
    original.set(key, previous);
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, value);
  }
  return original;
}

function restoreEnvironment(original: Map<string, string | undefined>): void {
  for (const [key, value] of original) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else Reflect.set(process.env, key, value);
  }
}
