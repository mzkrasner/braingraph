# Architecture

## Objective

Braingraph gives an agent enough structure to help a human maintain a coherent second brain over time without turning the workspace into an agent-specific database or a mirror of every external tool.

## Layers

### Knowledge core

The knowledge core defines projects, domains, reusable knowledge, raw intake, source-processing state, reports, and retrieval evaluations. It is always installed.

### Workspace governance

Generated agent instructions define source ownership, ingestion, retrieval, taxonomy evolution, privacy, external writes, and the boundary between durable and temporary information.

### Human and agent interfaces

Obsidian is the configured human interface over the Markdown vault. QMD is the configured agent discovery and retrieval layer over selected durable Markdown. Braingraph installs or verifies both, creates their configuration, and keeps their caches and UI state non-canonical.

### Capability adapters

External systems and software repositories are capabilities around the core. Their absence must degrade gracefully.

### Optional profiles

Profiles add behavior for a class of workspace. The first optional profile is `software`, which adds repository hubs and guarded worktree management.

## Canonical State

- `braingraph.json` owns workspace configuration and registered capabilities.
- Markdown owns durable knowledge.
- External systems continue to own their declared live state.
- Obsidian workspace/UI state and QMD indexes are disposable local state.
- Git repositories own source and branch state.
- Temporary implementation artifacts stay outside the durable knowledge graph.

## Evolution Rules

Braingraph creates missing managed files but does not overwrite existing files during initialization. A future migration command may update managed templates, but it must distinguish generated sections from human-authored content and present a reviewable plan before applying changes.
