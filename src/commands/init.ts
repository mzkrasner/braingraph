import fs from "node:fs";
import path from "node:path";

import {
  parseArgs,
  booleanOption,
  listOption,
  rejectUnknownOptions,
  stringOption,
} from "../args.js";
import { UsageError } from "../errors.js";
import { ActionPlan, readJson } from "../files.js";
import {
  createManifest,
  MANIFEST_NAME,
  validateManifest,
} from "../manifest.js";
import {
  knowledgeReplacements,
  renderTemplateTree,
  rootReplacements,
  SCHEMA_FILE,
  templateContent,
  TEMPLATE_ROOT,
} from "../templates.js";
import type {
  CommandContext,
  OptionMap,
  WorkspaceManifest,
  WorkspaceProfile,
} from "../types.js";
import { assertRelativePath, sameJson, slugify, unique } from "../util.js";

const EMPTY_DIRECTORIES = [
  "projects",
  "domains",
  "wiki",
  "raw",
  "raw/processed",
  "raw/attachments",
  "reports",
];
const SOFTWARE_PROFILE: WorkspaceProfile = "software";

export const INIT_HELP = `Usage:
  braingraph init [directory] --name <name> [options]

Options:
  --name <name>                 Human-facing workspace and Obsidian vault name
  --slug <slug>                 Stable workspace slug (default: derived from name)
  --knowledge-dir <path>        Obsidian vault directory (default: Knowledge)
  --profile <profile>           Additional profile; currently: software
  --configure                   Configure QMD after initialization
  --install-tools               Install Obsidian and QMD before QMD configuration
  --dry-run                     Show changes without writing or installing
  --help                        Show this help

Initialization is additive. Existing files are preserved and conflicting manifests fail.`;

/** Creates or additively updates a Braingraph workspace. */
export async function initCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): Promise<number> {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, [
    "name",
    "slug",
    "knowledge-dir",
    "profile",
    "configure",
    "install-tools",
    "dry-run",
    "help",
  ]);
  if (booleanOption(options, "help")) {
    (context.output ?? process.stdout).write(`${INIT_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("init accepts at most one directory");

  const root = path.resolve(positionals[0] ?? process.cwd());
  const manifestFile = path.join(root, MANIFEST_NAME);
  const existing = readExistingManifest(manifestFile);
  const proposed = proposeManifest(root, options, existing);
  assertCompatibleIdentity(existing, proposed);

  const plan = new ActionPlan({
    dryRun: booleanOption(options, "dry-run"),
    output: context.output ?? process.stdout,
  });
  writeWorkspace(root, manifestFile, existing, proposed, plan);
  await runOptionalSetup(root, proposed, options, plan, context);
  return 0;
}

function readExistingManifest(file: string): WorkspaceManifest | undefined {
  if (!fs.existsSync(file)) return undefined;
  const candidate = readJson(file);
  const errors = validateManifest(candidate);
  if (errors.length > 0) {
    throw new UsageError(
      `existing ${MANIFEST_NAME} is invalid: ${errors.join("; ")}`,
    );
  }
  return candidate as WorkspaceManifest;
}

function proposeManifest(
  root: string,
  options: OptionMap,
  existing: WorkspaceManifest | undefined,
): WorkspaceManifest {
  const name =
    stringOption(options, "name") ??
    existing?.workspace.name ??
    path.basename(root);
  if (name.trim().length === 0)
    throw new UsageError("--name must not be empty");
  const slug =
    stringOption(options, "slug") ?? existing?.workspace.slug ?? slugify(name);
  const knowledgeDirectory = assertRelativePath(
    stringOption(
      options,
      "knowledge-dir",
      existing?.knowledge.directory ?? "Knowledge",
    ),
    "knowledge directory",
  );
  const profiles = unique<WorkspaceProfile>([
    "knowledge",
    ...(existing?.workspace.profiles ?? []),
    ...requestedProfiles(options),
  ]);
  const proposed = existing
    ? {
        ...structuredClone(existing),
        workspace: { ...existing.workspace, name, slug, profiles },
        knowledge: { ...existing.knowledge, directory: knowledgeDirectory },
      }
    : createManifest({ name, slug, knowledgeDirectory, profiles });
  const errors = validateManifest(proposed);
  if (errors.length > 0) throw new UsageError(errors.join("; "));
  return proposed;
}

function requestedProfiles(options: OptionMap): WorkspaceProfile[] {
  return listOption(options, "profile").map((profile) => {
    if (profile !== SOFTWARE_PROFILE) {
      throw new UsageError(`unsupported profile: ${profile}`);
    }
    return profile;
  });
}

function assertCompatibleIdentity(
  existing: WorkspaceManifest | undefined,
  proposed: WorkspaceManifest,
): void {
  if (existing === undefined) return;
  if (
    existing.workspace.name !== proposed.workspace.name ||
    existing.workspace.slug !== proposed.workspace.slug ||
    existing.knowledge.directory !== proposed.knowledge.directory
  ) {
    throw new UsageError(
      `existing ${MANIFEST_NAME} conflicts with requested workspace identity`,
    );
  }
}

function writeWorkspace(
  root: string,
  manifestFile: string,
  existing: WorkspaceManifest | undefined,
  proposed: WorkspaceManifest,
  plan: ActionPlan,
): void {
  plan.ensureDirectory(root);
  if (existing === undefined)
    plan.writeMissing(manifestFile, `${JSON.stringify(proposed, null, 2)}\n`);
  else if (!sameJson(existing, proposed))
    plan.writeJson(manifestFile, proposed, "update workspace profiles");
  else plan.note("preserve file", manifestFile, "skipped");
  plan.writeMissing(
    path.join(root, "schemas", "braingraph-workspace.schema.json"),
    fs.readFileSync(SCHEMA_FILE, "utf8"),
  );

  const knowledgeRoot = path.join(root, proposed.knowledge.directory);
  plan.writeMissing(
    path.join(root, "AGENTS.md"),
    templateContent("core/AGENTS.md", rootReplacements(proposed)),
  );
  renderTemplateTree({
    source: path.join(TEMPLATE_ROOT, "core", "Knowledge"),
    destination: knowledgeRoot,
    replacements: knowledgeReplacements(proposed),
    plan,
  });

  for (const relative of EMPTY_DIRECTORIES) {
    plan.ensureDirectory(path.join(knowledgeRoot, relative));
  }

  if (proposed.workspace.profiles.includes(SOFTWARE_PROFILE)) {
    const repositoriesRoot = path.join(root, "repositories");
    plan.ensureDirectory(repositoriesRoot);
    plan.writeMissing(
      path.join(repositoriesRoot, "README.md"),
      fs.readFileSync(
        path.join(TEMPLATE_ROOT, "software", "repositories-README.md"),
        "utf8",
      ),
    );
  }
}

async function runOptionalSetup(
  root: string,
  manifest: WorkspaceManifest,
  options: OptionMap,
  plan: ActionPlan,
  context: CommandContext,
): Promise<void> {
  const installTools = booleanOption(options, "install-tools");
  const configure = booleanOption(options, "configure");
  if (!installTools && !configure) return;
  if (plan.dryRun) {
    if (installTools) plan.note("install tools", "Obsidian and QMD");
    if (configure)
      plan.note("configure QMD", manifest.knowledge.qmd.collection);
    return;
  }
  const { toolsInstallCommand } = await import("./tools.js");
  const { qmdConfigureCommand } = await import("./qmd.js");
  if (installTools) toolsInstallCommand([root, "--execute"], context);
  if (configure) qmdConfigureCommand([root], context);
}
