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

## Cross-Agent Contract

- Treat each scoped `AGENTS.md` as the canonical standing instruction file for that directory. Nested files intentionally add narrower scope; they are not copies of the root rules.
- Keep every sibling `CLAUDE.md` as the exact import-only bridge `@AGENTS.md`. Do not add independent policy there.
- Treat `.agents/skills/<skill>/SKILL.md` as the only canonical project skill catalog. Do not mirror skill bodies into `.claude/skills/`, `.cursor/skills/`, or `.grok/skills/`.
- Codex, Cursor, and Grok Build discover the canonical instruction and skill locations directly. Claude Code reaches the same instructions through `CLAUDE.md`.
- If the active client does not natively surface `.agents/skills`, list the available `SKILL.md` files, inspect their frontmatter, and load the complete matching skill before acting. Native slash-menu parity is not required for semantic compatibility.
- Tool-specific files may adapt discovery only. They must not become a second source of behavioral truth.

## Engineering Rules

- Support Node.js 22 and later without runtime dependencies. Compile against the latest
  `@types/node` release from the oldest supported Node major so type checking cannot admit APIs
  unavailable on that runtime. Raise the minimum runtime and CI floor before advancing the type
  definitions to a newer major.
- Use pnpm for dependency and script execution; do not create npm or Yarn lockfiles. Treat
  `pnpm-lock.yaml` as pnpm-generated output: regenerate it with the repository-pinned pnpm version
  and never run Prettier over it.
- Keep TypeScript strict, lint clean, formatted with Prettier, and covered by Vitest.
- Put deterministic safety behavior in reusable Braingraph commands and tests when the product performs
  filesystem or Git mutations. Keep semantic workspace adoption agent-led; do not replace judgment with
  a bespoke migration framework.
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

Keep the setup task under this repository's instruction scope until the target workspace's canonical
instructions have been installed and verified. For an existing workspace, use the skill's proportional
adoption workflow. Do not invent a one-off migration program, state machine, exhaustive hash ledger, or
freeze unrelated Git state unless a demonstrated risk requires it and the human separately approves it.

Treat repeatable setup friction as product evidence. After diagnosing local configuration, setup agents should surface limitations, brittle assumptions, confusing behavior, or missing generalization and use the skill's `references/product-feedback.md` workflow to prepare a sanitized, duplicate-checked GitHub issue. Creating the issue is an external write and requires explicit human approval.

## Verification

Run `pnpm qa` after changing code, templates, schemas, or commands. Vitest suites must use temporary directories and local synthetic Git repositories; they must not require network access, depend on installed desktop tools, or mutate the developer's Obsidian or QMD state.
