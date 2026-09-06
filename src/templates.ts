import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listFiles } from "./files.js";
import type { ActionPlan } from "./files.js";
import type { WorkspaceManifest } from "./types.js";

type Replacements = Record<string, string>;

interface RenderTemplateTreeOptions {
  source: string;
  destination: string;
  replacements: Replacements;
  plan: ActionPlan;
}

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const TEMPLATE_ROOT = path.join(PACKAGE_ROOT, "templates");
export const SCHEMA_FILE = path.join(
  PACKAGE_ROOT,
  "schemas",
  "workspace.schema.json",
);

/** Replaces named placeholders in one template string. */
export function render(value: string, replacements: Replacements): string {
  let result = value;
  for (const [key, replacement] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, replacement);
  }
  return result;
}

/** Additively renders a template directory into a destination. */
export function renderTemplateTree(options: RenderTemplateTreeOptions): void {
  const { source, destination, replacements, plan } = options;
  for (const file of listFiles(source)) {
    const relative = path
      .relative(source, file)
      .replace(/(^|[/\\])gitignore\.template$/, "$1.gitignore");
    const target = path.join(destination, relative);
    const content = render(readTemplate(file), replacements);
    plan.writeMissing(target, content);
  }
}

/** Reads and renders one packaged template file. */
export function templateContent(
  relative: string,
  replacements: Replacements = {},
): string {
  const file = path.join(TEMPLATE_ROOT, relative);
  return render(readTemplate(file), replacements);
}

function readTemplate(file: string): string {
  return fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
}

/** Converts manifest include globs into QMD's collection mask syntax. */
export function qmdMask(include: readonly string[]): string {
  return `{${include.join(",")}}`;
}

/** Builds root-instruction template replacements from a manifest. */
export function rootReplacements(manifest: WorkspaceManifest): Replacements {
  return {
    WORKSPACE_NAME: manifest.workspace.name,
    WORKSPACE_SLUG: manifest.workspace.slug,
    KNOWLEDGE_DIR: manifest.knowledge.directory,
    QMD_SECTION: qmdRootSection(manifest),
    SOFTWARE_SECTION: manifest.workspace.profiles.includes("software")
      ? softwareRootSection()
      : "",
  };
}

/** Builds knowledge-vault template replacements from a manifest. */
export function knowledgeReplacements(
  manifest: WorkspaceManifest,
): Replacements {
  return {
    ...rootReplacements(manifest),
    WORKSPACE_ROOT_RELATIVE:
      path
        .relative(manifest.knowledge.directory, ".")
        .split(path.sep)
        .join("/") || ".",
    QMD_RETRIEVAL_SECTION: qmdRetrievalSection(manifest),
    QMD_START_SECTION: qmdStartSection(manifest),
  };
}

function qmdRootSection(manifest: WorkspaceManifest): string {
  const collection = manifest.knowledge.qmd.collection;
  return `## QMD Retrieval\n\nThis brain's collection is \`${collection}\`. Use \`braingraph qmd search <workspace> --text "terms"\`, \`braingraph qmd query <workspace> --text "intent"\`, and \`braingraph qmd get <workspace> --text "qmd://<collection>/<document>"\` with the exact resolved root. These wrappers refuse missing local configuration or conflicting index overrides rather than searching another brain. Retrieve sources, not snippets; indexes and caches are local rebuildable state, never authority. After authorized material knowledge changes, run \`braingraph qmd refresh <workspace>\` when background refresh is not active. If unavailable, use scoped Markdown search and report stale retrieval.`;
}

function qmdRetrievalSection(manifest: WorkspaceManifest): string {
  const collection = manifest.knowledge.qmd.collection;
  return `## QMD\n\nUse \`braingraph qmd search <workspace> --text "terms"\` for exact identifiers, \`braingraph qmd query <workspace> --text "intent"\` for conceptual retrieval, and \`braingraph qmd get <workspace> --text "qmd://${collection}/<document>"\` to read results. Pass the exact coordination root, not the vault or a sibling brain. The wrappers enforce local index selection. Read governing files and source registries directly because they are excluded from semantic ranking. If Braingraph or QMD is unavailable, use scoped Markdown and exact filesystem search; do not fall back to an unqualified global QMD invocation.`;
}

function qmdStartSection(manifest: WorkspaceManifest): string {
  const collection = manifest.knowledge.qmd.collection;
  return `## Searching With QMD\n\nThe configured collection is \`${collection}\`. Search for candidate pages, retrieve complete relevant sections, and cite the underlying Markdown. QMD is an index, not a source of truth.`;
}

function softwareRootSection(): string {
  return `## Software Profile\n\nRead \`braingraph.json\` before assuming software repositories are part of this workspace. When the \`software\` profile is enabled, configured repositories live under \`repositories/\` as managed-worktree or attached-checkout hubs. Read each hub's \`AGENTS.md\`, then the selected checkout's repository-native instructions. Use isolated feature worktrees for managed implementation and stable integration worktrees only for orientation. Cleanup is inspection-first, refuses dirty worktrees and unpushed commits, requires exact human confirmation, and never deletes branches implicitly. Attached checkout locations and local discovery bridges are machine-local state, not durable workspace configuration. A bridge created for one attached checkout does not configure sibling worktrees or other clones; verify their discovery route separately. When the profile is absent, do not introduce repository or worktree structure without human approval.`;
}
