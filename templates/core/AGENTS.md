# {{WORKSPACE_NAME}} Workspace Guide

This directory is the coordination root for the {{WORKSPACE_NAME}} Braingraph workspace. Treat its knowledge base, external systems, repositories, and temporary artifacts according to their declared ownership.

## Start Here

1. Read `braingraph.json` for the configured workspace, profiles, external systems, and repositories.
2. Read `{{KNOWLEDGE_DIR}}/Start Here.md` and `{{KNOWLEDGE_DIR}}/index.md` before broad knowledge work.
3. Read `{{KNOWLEDGE_DIR}}/AGENTS.md` before changing knowledge, taxonomy, source-processing state, or retrieval configuration.
4. Verify volatile information in the external system that owns it before reporting it as current.

## Sources Of Truth

`braingraph.json` declares external systems and their ownership, access, freshness, capture, and sensitivity rules. Do not infer a system's role from familiarity with the vendor.

- The Markdown knowledge base owns durable synthesis, decisions, concepts, and project understanding.
- External systems continue to own the live information assigned to them in `braingraph.json`.
- Raw inputs are pending sources, not automatically trusted knowledge.
- Reports are dated snapshots, not current state unless independently verified.
- Search indexes, application caches, and generated views are rebuildable and never canonical.
- Temporary execution artifacts must not become a parallel project narrative.

When adding a new external system, establish what it owns, how records are identified, how freshness is verified, what agents may read or write, what requires human approval, how content should be captured, and what happens when access fails.

## Agent Permissions

- Read and analyze available workspace material when relevant to the user's request and permitted by its sensitivity policy.
- Draft external communications and proposed changes by default.
- Obtain explicit human approval before external writes, destructive actions, broad taxonomy changes, or disclosure of sensitive material.
- A described team workflow is context, not standing authorization to execute it.
- Do not turn connector availability into permission.
- Do not weaken privacy or safety boundaries merely because a tool can access the data.

## Working Pattern

1. Orient from the relevant project or domain hub.
2. Search existing knowledge before creating a page or category.
3. Retrieve complete sources rather than relying on snippets.
4. Distinguish sourced fact, human interpretation, and new inference.
5. Keep contradictions and unresolved questions explicit.
6. Update durable knowledge after meaningful decisions or discoveries.
7. Keep live status in its owning system and link to it when appropriate.

## Shared-System Communication

External messages and shared-system records must be understandable without access to this local workspace.

- Do not cite machine-local paths, local caches, unpublished files, or ignored artifacts in shared systems.
- Restate the necessary context directly and link only resources the intended audience can access.
- Never include credentials, tokens, private environment values, or sensitive raw data.

{{QMD_SECTION}}

{{SOFTWARE_SECTION}}

## Security

- Follow the sensitivity level and access boundaries declared for every source system.
- Never store credentials, tokens, secret environment values, or unrestricted connector responses in the knowledge base.
- Store regulated or highly sensitive source material only in an approved location; capture the minimum safe durable synthesis.
- Before committing or sharing anything, check for secrets, private identifiers, and machine-specific data.
