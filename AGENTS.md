# Braingraph Repository Guide

This repository builds Braingraph itself. It is not a generated knowledge workspace.

## Product Boundary

Braingraph is an agent-first, Markdown-native second-brain scaffold. Obsidian is its default human interface and QMD is its default agent retrieval layer. The underlying knowledge must remain readable and recoverable as ordinary Markdown, without depending on application state, a particular agent vendor, Git, or a fixed set of external systems.

- Keep the core knowledge architecture tool-neutral.
- Set up Obsidian and QMD by default while keeping their state rebuildable.
- Treat software repository and worktree behavior as an optional profile.
- Model external systems through declared ownership and access semantics rather than vendor-specific assumptions.
- Use only fictional, non-sensitive fixtures and examples.
- Never add machine-specific paths, credentials, organization-specific policy, or live user data to templates.

## Engineering Rules

- Support Node.js 22 and later without runtime dependencies.
- Use pnpm for dependency and script execution; do not create npm or Yarn lockfiles.
- Keep TypeScript strict, lint clean, formatted with Prettier, and covered by Vitest.
- Prefer deterministic filesystem and Git behavior over prose-only instructions when safety matters.
- Every mutating CLI command must support `--dry-run`.
- Initialization must be idempotent and must not overwrite user-authored files.
- Destructive operations must default to inspection and require exact confirmation.
- Never force-remove worktrees or delete branches as an implied cleanup step.
- Keep generated Markdown readable without Braingraph installed.
- Keep QMD caches and indexes outside generated repositories; only configuration and instructions belong in the workspace.
- Keep schema, runtime validation, TypeScript contracts, CLI help, generated instructions, documentation, and tests semantically aligned.
- Bump `templateVersion` when a future release changes the generated governance or template contract, and provide a reviewable migration path before rewriting existing workspaces.
- Preserve a clear authorization boundary: proactive maintenance proposals are expected, but connector availability is never write permission.
- Persist setup decisions that fresh agents must follow, such as baseline sensitivity and delegated local-maintenance scope; do not leave them only in setup conversation history.

## Setup Requests

When a user asks to create, adopt, or configure a Braingraph workspace, load `.agents/skills/setup-braingraph/SKILL.md` and follow its proposal-first workflow.

## Verification

Run `pnpm qa` after changing code, templates, schemas, or commands. Vitest suites must use temporary directories and local synthetic Git repositories; they must not require network access, depend on installed desktop tools, or mutate the developer's Obsidian or QMD state.
