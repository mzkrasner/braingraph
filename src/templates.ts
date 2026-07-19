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
    const content = render(fs.readFileSync(file, "utf8"), replacements);
    plan.writeMissing(target, content);
  }
}

/** Reads and renders one packaged template file. */
export function templateContent(
  relative: string,
  replacements: Replacements = {},
): string {
  const file = path.join(TEMPLATE_ROOT, relative);
  return render(fs.readFileSync(file, "utf8"), replacements);
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
    SOFTWARE_SECTION: softwareRootSection(),
  };
}

/** Builds knowledge-vault template replacements from a manifest. */
export function knowledgeReplacements(
  manifest: WorkspaceManifest,
): Replacements {
  return {
    ...rootReplacements(manifest),
    QMD_RETRIEVAL_SECTION: qmdRetrievalSection(manifest),
    QMD_START_SECTION: qmdStartSection(manifest),
  };
}

function qmdRootSection(manifest: WorkspaceManifest): string {
  const collection = manifest.knowledge.qmd.collection;
  return `## QMD Retrieval\n\nQMD is the configured agent discovery layer for this workspace. The collection is \`${collection}\`. Search results are leads: retrieve complete source sections and cite the Markdown files. The QMD index and model cache are local, rebuildable state and must not be committed or treated as authority. Run \`braingraph qmd refresh\` after material knowledge changes when background refresh is not active.`;
}

function qmdRetrievalSection(manifest: WorkspaceManifest): string {
  const collection = manifest.knowledge.qmd.collection;
  return `### QMD\n\nUse \`qmd search <terms> -c ${collection}\` for exact identifiers and a structured \`qmd query\` with agent-authored intent and lexical/semantic terms for conceptual retrieval. Fetch material results with \`qmd get\` or \`qmd multi-get\`. Read governing files and source registries directly because they are intentionally excluded from semantic ranking. If QMD is unavailable or stale, use direct Markdown and exact filesystem search rather than treating the knowledge as inaccessible.`;
}

function qmdStartSection(manifest: WorkspaceManifest): string {
  const collection = manifest.knowledge.qmd.collection;
  return `## Searching With QMD\n\nThe configured collection is \`${collection}\`. Search for candidate pages, retrieve complete relevant sections, and cite the underlying Markdown. QMD is an index, not a source of truth.`;
}

function softwareRootSection(): string {
  return `## Software Profile\n\nRead \`braingraph.json\` before assuming software repositories are part of this workspace. When the \`software\` profile is enabled, configured repositories live under \`repositories/\` as worktree hubs. Read each hub's \`AGENTS.md\`, then the selected worktree's repository-native instructions. Use isolated feature worktrees for edits and stable integration worktrees only for orientation. Cleanup is inspection-first and requires exact human confirmation; it never deletes branches implicitly. When the profile is absent, do not introduce repository or worktree structure without human approval.`;
}
