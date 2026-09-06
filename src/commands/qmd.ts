import fs from "node:fs";
import path from "node:path";

import {
  booleanOption,
  parseArgs,
  rejectUnknownOptions,
  stringOption,
} from "../args.js";
import { UsageError } from "../errors.js";
import { loadWorkspace } from "../manifest.js";
import { commandExists, displayCommand } from "../process.js";
import {
  assertQmdDestinations,
  assertQmdConfig,
  localQmdConfig,
  qmdEnvironment,
  QMD_PROBE_TIMEOUT_MS,
  QMD_TIMEOUT_MS,
  requireLocalQmdConfig,
  runLocalQmd,
  withQmdLock,
} from "../qmd-runtime.js";
import { qmdMask } from "../templates.js";
import type { CommandContext, OptionMap, OutputStream } from "../types.js";
import { sameCanonicalPath } from "../util.js";

export const MINIMUM_QMD_VERSION = "2.5.3";
const SUPPORTED_QMD_MAJOR = 2;
const TIMEOUT_OPTION = "timeout-seconds";

export const QMD_HELP = `Usage:
  braingraph qmd configure [directory] [--no-embed] [--timeout-seconds 600] [--dry-run]
  braingraph qmd refresh [directory] [--embed] [--timeout-seconds 600] [--dry-run]
  braingraph qmd search|query [directory] --text <query> [--limit 10]
  braingraph qmd get [directory] --text qmd://<collection>/<document>

configure creates a workspace-local QMD index, registers the vault collection,
installs QMD's canonical agent skill into the workspace .agents/skills catalog,
adds or updates workspace-purpose context, indexes Markdown, and embeds by default.
refresh updates only that local index and embeds only when --embed is supplied.
Mutations use a per-workspace lock and a per-command timeout (1-3600 seconds).
Retrieval is restricted to the manifest collection; index overrides are rejected.
Dry runs remain available before QMD is installed and do not acquire a lock.`;

/** Registers and initially indexes the configured QMD collection. */
export async function qmdConfigureCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): Promise<number> {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["embed", TIMEOUT_OPTION, "dry-run", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${QMD_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("qmd configure accepts at most one directory");
  const workspace = loadWorkspace(positionals[0] ?? process.cwd());
  assertQmdDestinations(workspace.root, true);
  assertQmdConfig(workspace.root);
  qmdEnvironment(workspace.root);
  const dryRun = booleanOption(options, "dry-run");
  const qmdAvailable = commandExists("qmd");
  if (!dryRun && !qmdAvailable) ensureQmd();
  if (qmdAvailable) await assertSupportedQmdVersion(workspace.root);
  const timeoutMs = timeoutOption(options);
  const embed = booleanOption(options, "embed", true);
  const qmd = workspace.manifest.knowledge.qmd;
  const vault = path.join(
    workspace.root,
    workspace.manifest.knowledge.directory,
  );
  const mask = qmdMask(qmd.include);
  const configure = async (): Promise<void> => {
    const hasLocalIndex = localQmdConfig(workspace.root) !== undefined;
    if (!hasLocalIndex) {
      await executeOrPrint(
        ["init"],
        dryRun,
        output,
        workspace.root,
        timeoutMs,
        true,
      );
      if (!dryRun) requireLocalQmdConfig(workspace.root);
    }

    const existing =
      qmdAvailable && hasLocalIndex
        ? await runLocalQmd(
            workspace.root,
            ["collection", "show", qmd.collection],
            {
              allowFailure: true,
              timeoutMs: QMD_PROBE_TIMEOUT_MS,
            },
          )
        : undefined;
    if (existing?.status === 0) {
      assertMatchingCollection(existing.stdout, vault, mask, qmd.collection);
      output.write(`QMD collection already matches: ${qmd.collection}\n`);
    } else {
      await executeOrPrint(
        ["collection", "add", vault, "--name", qmd.collection, "--mask", mask],
        dryRun,
        output,
        workspace.root,
        timeoutMs,
      );
    }

    await executeOrPrint(
      [
        "context",
        "add",
        `qmd://${qmd.collection}`,
        workspace.manifest.workspace.description,
      ],
      dryRun,
      output,
      workspace.root,
      timeoutMs,
    );
    await ensureQmdSkill(workspace.root, dryRun, output, timeoutMs);
    await executeOrPrint(["update"], dryRun, output, workspace.root, timeoutMs);
    if (embed)
      await executeOrPrint(
        ["embed", "-c", qmd.collection],
        dryRun,
        output,
        workspace.root,
        timeoutMs,
      );
  };
  if (dryRun) await configure();
  else await withQmdLock(workspace.root, "configure", configure);
  return 0;
}

/** Refreshes an existing QMD index and optionally its embeddings. */
export async function qmdRefreshCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): Promise<number> {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["embed", TIMEOUT_OPTION, "dry-run", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${QMD_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("qmd refresh accepts at most one directory");
  const workspace = loadWorkspace(positionals[0] ?? process.cwd());
  assertQmdDestinations(workspace.root, false);
  qmdEnvironment(workspace.root);
  const dryRun = booleanOption(options, "dry-run");
  if (!dryRun) ensureQmd();
  if (commandExists("qmd")) await assertSupportedQmdVersion(workspace.root);
  requireLocalQmdConfig(workspace.root);
  const timeoutMs = timeoutOption(options);
  const refresh = async (): Promise<void> => {
    await executeOrPrint(["update"], dryRun, output, workspace.root, timeoutMs);
    if (booleanOption(options, "embed")) {
      await executeOrPrint(
        ["embed", "-c", workspace.manifest.knowledge.qmd.collection],
        dryRun,
        output,
        workspace.root,
        timeoutMs,
      );
    }
  };
  if (dryRun) await refresh();
  else await withQmdLock(workspace.root, "refresh", refresh);
  return 0;
}

/** Returns the installed QMD version when it satisfies Braingraph's contract. */
export async function supportedQmdVersion(
  cwd: string,
): Promise<string | undefined> {
  if (!commandExists("qmd")) return undefined;
  const result = await runLocalQmd(cwd, ["--version"], {
    allowFailure: true,
    allowUnconfigured: true,
    timeoutMs: QMD_PROBE_TIMEOUT_MS,
  });
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

async function assertSupportedQmdVersion(cwd: string): Promise<void> {
  if ((await supportedQmdVersion(cwd)) === undefined) {
    throw new UsageError(
      `QMD ${MINIMUM_QMD_VERSION} or newer within major version ${String(SUPPORTED_QMD_MAJOR)} is required`,
    );
  }
}

async function ensureQmdSkill(
  workspaceRoot: string,
  dryRun: boolean,
  output: OutputStream,
  timeoutMs: number,
): Promise<void> {
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
  const result = await runLocalQmd(workspaceRoot, ["skill", "install"], {
    timeoutMs,
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

async function executeOrPrint(
  args: readonly string[],
  dryRun: boolean,
  output: OutputStream,
  cwd: string,
  timeoutMs: number,
  allowUnconfigured = false,
): Promise<void> {
  output.write(`${dryRun ? "[dry-run] " : ""}${displayCommand("qmd", args)}\n`);
  if (!dryRun) {
    await runLocalQmd(cwd, args, {
      stdio: "inherit",
      timeoutMs,
      allowUnconfigured,
    });
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
    pathMatch === undefined ||
    !sameCanonicalPath(pathMatch, vault) ||
    patternMatch !== mask
  ) {
    throw new UsageError(
      `QMD collection ${collection} already exists with a different path or mask; inspect it before changing local index state`,
    );
  }
}

function timeoutOption(options: OptionMap): number {
  return (
    integerOption(options, TIMEOUT_OPTION, QMD_TIMEOUT_MS / 1000, 3600) * 1000
  );
}

function integerOption(
  options: OptionMap,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const value = stringOption(options, name, String(fallback));
  const number = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > maximum
  ) {
    throw new UsageError(
      `--${name} must be an integer between 1 and ${String(maximum)}`,
    );
  }
  return number;
}

/** Searches the selected brain's declared collection without global index fallback. */
export async function qmdSearchCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): Promise<number> {
  return await retrievalCommand("search", tokens, context);
}

/** Runs hybrid retrieval within the selected brain's declared collection. */
export async function qmdQueryCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): Promise<number> {
  return await retrievalCommand("query", tokens, context);
}

/** Retrieves a document only from the selected brain's declared collection URI. */
export async function qmdGetCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): Promise<number> {
  return await retrievalCommand("get", tokens, context);
}

async function retrievalCommand(
  command: "search" | "query" | "get",
  tokens: readonly string[],
  context: CommandContext,
): Promise<number> {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(
    options,
    command === "get" ? ["text", "help"] : ["text", "limit", "help"],
  );
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${QMD_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError(`qmd ${command} accepts at most one directory`);
  const workspace = loadWorkspace(positionals[0] ?? process.cwd());
  requireLocalQmdConfig(workspace.root);
  qmdEnvironment(workspace.root);
  await assertSupportedQmdVersion(workspace.root);
  const value = stringOption(options, "text");
  if (!value?.trim() || value.startsWith("-") || /[\0\r\n]/.test(value))
    throw new UsageError(
      "--text requires a nonempty query or document URI, not a flag",
    );
  const collection = workspace.manifest.knowledge.qmd.collection;
  if (
    command === "get" &&
    (!value.startsWith(`qmd://${collection}/`) ||
      /[?#\\]/.test(value) ||
      value.split("/").some((segment) => segment === "." || segment === "..") ||
      value === `qmd://${collection}/`)
  )
    throw new UsageError(`document URI must belong to qmd://${collection}/`);
  const args =
    command === "get"
      ? [command, value]
      : [
          command,
          value,
          "-c",
          collection,
          "-n",
          String(integerOption(options, "limit", 10, 200)),
        ];
  const result = await runLocalQmd(workspace.root, args);
  output.write(result.stdout);
  return 0;
}
