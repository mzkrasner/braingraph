# Existing Workspace Adoption

Use this reference when Braingraph is being introduced into a directory that already contains notes,
repositories, agent instructions, tool configuration, or other working state.

## Principle

Adoption is a semantic mapping task led by the agent and reviewed by the human. Braingraph supplies
reusable commands, dry runs, and validation boundaries; it does not require a generic migration engine
or an exhaustive forensic record of the machine.

Start with the smallest change that makes canonical knowledge discoverable from the places where work
actually happens. Preserve useful existing structure when it already has clear ownership. Introduce new
taxonomy only where the current structure cannot express a durable distinction.

## Check The Setup Source

Before planning, record the Braingraph version and Git commit being used when available. If ordinary
read-only access to the project's current default branch or release is available, compare it with the
local checkout. Do not silently update the checkout, and do not block an otherwise sound assessment
when that comparison is unavailable. Tell the human when the setup source is stale or unverified.

Keep the control task in the Braingraph clone, or under another location that demonstrably surfaces the
same canonical setup skill, until the target workspace's own instructions are active and validated.
Moving the task to an ungoverned migration directory can silently discard the rules that govern setup.

## State Classes

Classify only the state relevant to the approved workspace:

| Class | Examples | Default treatment |
| --- | --- | --- |
| Canonical durable state | Markdown knowledge, source registries, manifests, governing instructions | Preserve, identify ownership and provenance, then map or edit only after approval |
| Reversible local state | Ignored discovery adapters and local tool configuration that must change | Capture the exact preimage of only the files touched, then make the smallest reversible update |
| Disposable derived state | QMD indexes, Obsidian window state, caches, build output | Rebuild from canonical files; do not migrate or inspect internal databases merely to preserve them |
| Unrelated state | Repositories, worktrees, branches, processes, and external systems outside the approved scope | Leave untouched; do not freeze, stash, snapshot, or inventory them exhaustively |

Sensitivity and external ownership are boundaries across these classes, not reasons to copy external
content into the vault. Keep linked systems authoritative according to their declared source contracts.

## Default Workflow

1. Confirm the workspace purpose, approved scope, coordination root, knowledge root, and operational
   roots.
2. Inventory the existing material needed to understand those boundaries. Do not recursively catalog
   the whole machine when representative paths answer the question.
3. Classify relevant state using the table above and identify conflicts, duplicate sources of truth,
   existing instruction ancestry, and content that should remain external.
4. Propose a concise mapping from existing material to Braingraph roles. Show files that will be
   created or changed, anything intentionally left in place, the discovery matrix, and unresolved
   decisions.
5. Obtain approval for the proposal.
6. Run the shipped Braingraph commands with `--dry-run`. Do not replace available commands with a
   custom wrapper.
7. Show consequential dry-run actions and obtain approval to execute.
8. Execute the smallest approved set of changes. Move or rewrite existing durable content only when
   that content migration was explicitly included in the proposal.
9. Rebuild disposable Obsidian/QMD state from the accepted canonical files.
10. Validate instruction discovery and knowledge retrieval from each representative working location.
    Report remaining gaps without manufacturing infrastructure to conceal them.

Two human approval boundaries are normally enough: proposal approval and execution approval after the
dry run. Add another gate only when a concrete irreversible, sensitive, or externally visible action
requires it.

## Keep The Process Proportional

Do not create a custom migration program, planner, state machine, hash chain, exhaustive evidence
ledger, or repeated activation/restore protocol by default. Do not freeze unrelated Git repositories
to create a false sense of atomicity.

A narrowly scoped helper can be justified when all of these are true:

- the approved work is genuinely repetitive or error-prone;
- shipped Braingraph commands do not cover it;
- its inputs, outputs, and rollback boundary are clear;
- the human approves the helper before it mutates anything; and
- the helper is smaller than the manual risk it removes.

If the same helper would benefit other workspaces, treat that as a Braingraph product gap and prepare a
sanitized issue using `product-feedback.md`. Do not quietly turn a user's workspace into the test bed
for an unreviewed migration subsystem.

## Broad Working Root, Narrow Knowledge Root

A common valid topology has a broad coordination root containing several repositories and a narrower
Obsidian vault within it. In that case:

- put only the minimum canonical coordination instructions at the broad root;
- keep durable knowledge in the narrower vault;
- index the approved knowledge corpus, not the entire working root;
- register or attach repositories individually when the software profile is enabled; and
- prove discovery from representative repositories and worktrees without duplicating the vault.

The location where an agent launches and the content QMD indexes are separate decisions.

## Completion Evidence

Keep the final record concise:

- approved roots and scope;
- canonical files created or changed;
- existing content preserved, linked, or intentionally left unmigrated;
- representative discovery checks;
- QMD collection path, inclusion boundary, and a small retrieval check;
- unresolved gaps and any proposed product issue; and
- exact local files whose preimages were retained for rollback.

Do not include unrelated repository status, raw sensitive content, credentials, machine-wide file
inventories, or cache internals.
