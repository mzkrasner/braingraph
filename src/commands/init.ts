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
  MaintenanceMode,
  OptionMap,
  Sensitivity,
  WorkspaceManifest,
  WorkspaceProfile,
  WorkspaceScope,
} from "../types.js";
import {
  assertCanonicalPathInside,
  assertKnowledgeDirectoryPath,
  sameJson,
  slugify,
  unique,
} from "../util.js";

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
const PROPOSAL_FIRST: MaintenanceMode = "proposal-first";
const MAINTENANCE_SCOPE_OPTION = "maintenance-scope";
const WORKSPACE_SCOPES: readonly WorkspaceScope[] = [
  "project",
  "organization",
  "professional-domain",
  "personal-domain",
  "mixed",
];
const SENSITIVITY_LEVELS: readonly Sensitivity[] = [
  "public",
  "private",
  "confidential",
  "regulated",
];
const MAINTENANCE_MODES: readonly MaintenanceMode[] = [
  PROPOSAL_FIRST,
  "delegated",
];
const ROOT_IGNORE_MARKER = "# Braingraph local and generated state";
const ROOT_IGNORE_BLOCK = `${ROOT_IGNORE_MARKER}
/.qmd/
/braingraph.local.json
/repositories/*/*/
`;

export const INIT_HELP = `Usage:
  braingraph init [directory] --name <name> [options]

Options:
  --name <name>                 Human-facing workspace and Obsidian vault name
  --slug <slug>                 Stable workspace slug (default: derived from name)
  --description <text>          Durable purpose used for agent and QMD context
  --scope <scope>               project | organization | professional-domain | personal-domain | mixed
  --sensitivity <level>         public | private | confidential | regulated (default: private)
  --maintenance-mode <mode>     proposal-first | delegated (default: proposal-first)
  --maintenance-scope <scope>   Required for delegated routine local maintenance
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
    "description",
    "scope",
    "sensitivity",
    "maintenance-mode",
    MAINTENANCE_SCOPE_OPTION,
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
  assertWorkspaceDestinations(root, proposed);

  const plan = new ActionPlan({
    root,
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
  const description =
    stringOption(options, "description") ??
    existing?.workspace.description ??
    `Durable knowledge workspace for ${name}.`;
  if (description.trim().length === 0) {
    throw new UsageError("--description must not be empty");
  }
  if (/\r|\n/.test(description)) {
    throw new UsageError("--description must be one line");
  }
  const scope = workspaceScopeOption(
    stringOption(options, "scope") ?? existing?.workspace.scope ?? "mixed",
  );
  const sensitivity = sensitivityOption(
    stringOption(options, "sensitivity") ??
      existing?.workspace.sensitivity ??
      "private",
  );
  const maintenanceMode = maintenanceModeOption(
    stringOption(options, "maintenance-mode") ??
      existing?.knowledge.maintenance.mode ??
      PROPOSAL_FIRST,
  );
  const delegatedScope = delegatedMaintenanceScope(
    options,
    maintenanceMode,
    existing,
  );
  const knowledgeDirectory = assertKnowledgeDirectoryPath(
    stringOption(options, "knowledge-dir") ??
      existing?.knowledge.directory ??
      "Knowledge",
  );
  const profiles = unique<WorkspaceProfile>([
    "knowledge",
    ...(existing?.workspace.profiles ?? []),
    ...requestedProfiles(options),
  ]);
  const proposed = existing
    ? {
        ...structuredClone(existing),
        workspace: {
          ...existing.workspace,
          name,
          slug,
          description,
          scope,
          sensitivity,
          profiles,
        },
        knowledge: {
          ...existing.knowledge,
          directory: knowledgeDirectory,
          maintenance: {
            mode: maintenanceMode,
            ...(delegatedScope === undefined ? {} : { delegatedScope }),
          },
        },
      }
    : createManifest({
        name,
        slug,
        description,
        scope,
        sensitivity,
        maintenanceMode,
        ...(delegatedScope === undefined ? {} : { delegatedScope }),
        knowledgeDirectory,
        profiles,
      });
  const errors = validateManifest(proposed);
  if (errors.length > 0) throw new UsageError(errors.join("; "));
  return proposed;
}

function sensitivityOption(value: string): Sensitivity {
  if (!SENSITIVITY_LEVELS.some((level) => level === value)) {
    throw new UsageError(
      `--sensitivity must be one of: ${SENSITIVITY_LEVELS.join(", ")}`,
    );
  }
  return value as Sensitivity;
}

function maintenanceModeOption(value: string): MaintenanceMode {
  if (!MAINTENANCE_MODES.some((mode) => mode === value)) {
    throw new UsageError(
      `--maintenance-mode must be one of: ${MAINTENANCE_MODES.join(", ")}`,
    );
  }
  return value as MaintenanceMode;
}

function delegatedMaintenanceScope(
  options: OptionMap,
  mode: MaintenanceMode,
  existing: WorkspaceManifest | undefined,
): string | undefined {
  if (mode === PROPOSAL_FIRST) {
    if (options.has(MAINTENANCE_SCOPE_OPTION)) {
      throw new UsageError(
        "--maintenance-scope is only valid with --maintenance-mode=delegated",
      );
    }
    return undefined;
  }
  const scope =
    stringOption(options, MAINTENANCE_SCOPE_OPTION) ??
    existing?.knowledge.maintenance.delegatedScope;
  if (scope === undefined || scope.trim().length === 0) {
    throw new UsageError(
      "--maintenance-scope is required with --maintenance-mode=delegated",
    );
  }
  return scope;
}

function workspaceScopeOption(value: string): WorkspaceScope {
  if (!WORKSPACE_SCOPES.some((scope) => scope === value)) {
    throw new UsageError(
      `--scope must be one of: ${WORKSPACE_SCOPES.join(", ")}`,
    );
  }
  return value as WorkspaceScope;
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
  plan.ensureTextBlock(
    path.join(root, ".gitignore"),
    ROOT_IGNORE_MARKER,
    ROOT_IGNORE_BLOCK,
  );
  if (existing === undefined)
    plan.writeMissing(manifestFile, `${JSON.stringify(proposed, null, 2)}\n`);
  else if (!sameJson(existing, proposed))
    plan.writeJson(manifestFile, proposed, "update workspace configuration");
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
  plan.writeMissing(
    path.join(root, "CLAUDE.md"),
    templateContent("core/CLAUDE.md"),
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

function assertWorkspaceDestinations(
  root: string,
  manifest: WorkspaceManifest,
): void {
  const destinations = [
    path.join(root, MANIFEST_NAME),
    path.join(root, ".gitignore"),
    path.join(root, "schemas"),
    path.join(root, "AGENTS.md"),
    path.join(root, "CLAUDE.md"),
    path.join(root, manifest.knowledge.directory),
  ];
  if (manifest.workspace.profiles.includes(SOFTWARE_PROFILE)) {
    destinations.push(path.join(root, "repositories"));
  }
  for (const destination of destinations) {
    assertCanonicalPathInside(root, destination, "managed destination");
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
