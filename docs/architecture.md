# Architecture

## Objective

Braingraph gives an agent enough structure to help a human maintain a coherent second brain over time without turning the workspace into an agent-specific database or a mirror of every external tool.

## Layers

### Knowledge core

The knowledge core defines projects, domains, reusable knowledge, raw intake, source-processing state, reports, and retrieval evaluations. It is always installed.

### Workspace governance

Generated agent instructions define source ownership, ingestion, retrieval, proactive maintenance, taxonomy evolution, privacy, external writes, and the boundary between durable and temporary information. They distinguish scoped local knowledge authorization from actions that always require separate approval.

### Human and agent interfaces

Obsidian is the configured human interface over the Markdown vault. QMD is the configured agent discovery and retrieval layer over selected durable Markdown. Braingraph installs or verifies both, creates their configuration, and keeps their caches and UI state non-canonical.

### Capability adapters

External systems and software repositories are capabilities around the core. Their absence must degrade gracefully.

### Optional profiles

Profiles add behavior for a class of workspace. The first optional profile is `software`, which adds repository hubs and guarded worktree management.

## Canonical State

- `braingraph.json` owns workspace configuration and registered capabilities.
- Workspace sensitivity is the baseline handling policy; source-specific rules may be stricter.
- `knowledge.maintenance` owns the default proposal-first or narrowly delegated local-maintenance boundary.
- `schemaVersion` owns manifest compatibility; `templateVersion` records the generated instruction and template contract.
- Markdown owns durable knowledge.
- External systems continue to own their declared live state.
- Obsidian workspace/UI state and QMD indexes are disposable local state.
- Git repositories own source and branch state.
- Temporary implementation artifacts stay outside the durable knowledge graph.

## Evolution Rules

Braingraph creates missing managed files but does not overwrite existing files during initialization. Older supported `templateVersion` values remain loadable so `doctor` can report drift and a future migration command can present a reviewable plan. A migration may update managed templates only after distinguishing generated sections from human-authored content.

Workspace purpose, scope, external-system contracts, and repository configuration may evolve in the manifest. Retired external systems remain as inactive provenance records. Generated agents should surface durable maintenance candidates at meaningful milestones, but they must not turn ordinary work into exhaustive journaling or silently restructure the taxonomy.

Source ingestion moves through explicit states: pending, proposed, applied, no-change, blocked, or out-of-scope. The source ledger advances only after the corresponding review or authorized knowledge change succeeds. Retrieval misses become small evaluation fixtures when they reveal a durable routing problem.
