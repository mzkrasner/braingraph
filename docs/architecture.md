# Architecture

## Objective

Braingraph gives an agent enough structure to help a human maintain a coherent second brain over time without turning the workspace into an agent-specific database or a mirror of every external tool.

## Layers

### Knowledge core

The knowledge core defines projects, domains, reusable knowledge, raw intake, source-processing state, reports, and retrieval evaluations. It is always installed.

### Workspace governance

Generated agent instructions define source ownership, ingestion, retrieval, proactive maintenance, taxonomy evolution, privacy, external writes, and the boundary between durable and temporary information. They distinguish scoped local knowledge authorization from actions that always require separate approval.

Each scoped `AGENTS.md` is canonical. Claude Code receives an import-only `CLAUDE.md` bridge; clients that already read `AGENTS.md` receive no redundant rules file. Reusable project skills are canonical under `.agents/skills`, with a standing file-read protocol for clients that do not discover that location natively. See `agent-compatibility.md`.

### Human and agent interfaces

Obsidian is the configured human interface over the Markdown vault. QMD is the configured agent discovery and retrieval layer over selected durable Markdown. Braingraph installs or verifies both, creates their configuration, and keeps their caches and UI state non-canonical.

### Capability adapters

External systems and software repositories are capabilities around the core. Their absence must degrade gracefully.

### Optional profiles

Profiles add behavior for a class of workspace. The first optional profile is `software`, which adds repository hubs and guarded worktree management.

## Workspace Topology

The coordination root, knowledge root, and operational roots are separate architectural roles:

- The coordination root contains `braingraph.json`, root governance, capability hubs, and the knowledge directory.
- The knowledge root is the Obsidian-compatible Markdown vault.
- Operational roots are the directory trees where the human actually launches agents or performs work.

A workspace is usable only when agents launched from representative operational locations can discover its canonical instructions. An ancestor relationship can provide that path when client instruction inheritance and sensitivity scope are appropriate. Otherwise, use explicit adapters that point to canonical files without copying policy.

Repository registration does not establish universal discovery. A local bridge for an attached checkout covers only that checkout. Sibling Git worktrees, separate clones, and working directories outside the coordination root need their own proven route through parent coordination, tracked repository instructions, or a local adapter.

Operational paths and adapters are machine-local facts. Keep absolute paths out of portable shared configuration, validate them during setup, and reassess them when repositories move or the human's working pattern changes.

## Agent-Led Adoption

Adopting an existing workspace is intentionally a semantic, agent-led process rather than a
deterministic migration subsystem. The agent identifies the workspace's actual sources of truth,
proposes a minimal mapping, and asks the human to resolve ownership or taxonomy ambiguity. Shipped
Braingraph commands own repeatable filesystem and Git safety; setup prose must not be expanded into
one-off planners, state machines, or machine-wide evidence ledgers.

Canonical durable state is preserved and mapped, reversible local state is backed up only where it
will change, disposable interface/index state is rebuilt, and unrelated state remains untouched. The
detailed adoption contract lives in
`../.agents/skills/setup-braingraph/references/existing-workspace-adoption.md`.

## Canonical State

- `braingraph.json` owns workspace configuration and registered capabilities.
- Ignored `braingraph.local.json` owns machine-local attachment paths and bridge choices. It must never become portable or canonical configuration.
- Expected external account/tenant/principal constraints are portable; local connector bindings are per-brain entries in ignored `braingraph.local.json`, never credentials or proof of current authentication.
- Workspace sensitivity is the baseline handling policy; source-specific rules may be stricter.
- `knowledge.maintenance` owns the default proposal-first or narrowly delegated local-maintenance boundary.
- `schemaVersion` owns manifest compatibility; `templateVersion` records the generated instruction and template contract.
- Markdown owns durable knowledge.
- External systems continue to own their declared live state.
- Obsidian workspace/UI state, workspace-local `.qmd/` configuration and indexes, and shared QMD model caches are disposable local state.
- Git repositories own source and branch state.
- Repository hubs own durable Braingraph governance. Managed anchors/worktrees and attached checkout paths remain ignored local state.
- Temporary implementation artifacts stay outside the durable knowledge graph.
- `AGENTS.md` and `.agents/skills` own agent behavior; client-specific discovery files are non-canonical adapters.
- A successful setup report proves representative discovery paths at that point in time; `doctor` validates registered artifacts but cannot prove unmodeled launch locations.

## Evolution Rules

Braingraph creates missing managed files but does not overwrite existing files during initialization. New workspaces use template contract 2. Older `templateVersion` values remain loadable; `doctor` reports drift without silently marking an upgrade complete. The [reviewable upgrade guide](upgrading.md) uses a separate comparison scaffold, narrow backups, and approved file-by-file merges that preserve human-authored content. It does not introduce an automatic migration engine.

Workspace purpose, scope, external-system contracts, and repository configuration may evolve in the manifest. Retired external systems remain as inactive provenance records. Generated agents should surface durable maintenance candidates at meaningful milestones, but they must not turn ordinary work into exhaustive journaling or silently restructure the taxonomy.

Source ingestion moves through explicit states: pending, proposed, applied, no-change, blocked, or out-of-scope. The source ledger advances only after the corresponding review or authorized knowledge change succeeds. Retrieval misses become small evaluation fixtures when they reveal a durable routing problem.

## Multiple Independent Brains

Multiple brains per machine are a core topology, not an exceptional setup. Each root
owns a manifest, scoped governance, Markdown vault, local index, connector bindings, and
maintenance lock/status. There is no global active-brain registry or automatic union index.
The same application installation and model cache may serve several brains without
sharing their sources, authentication choices, permissions, or search results.

Commands with an explicit target resolve that target independently of the caller's
working directory. Omitted targets use the current workspace only as a convenience;
agents and scheduled invocations should supply the exact root. Search failures remain
local failures. Cross-brain work is a separately scoped request and must preserve source
attribution and the stricter applicable disclosure boundary.

QMD calls are bounded, reject conflicting index/config environment overrides, normalize
the child working directory, and require the selected local index configuration. Index
mutations use a workspace-local exclusive lock. Scheduling is opt-in infrastructure, not
authorization for inbox ingestion, external writes, or opportunity monitoring.

## Verification Boundaries

Setup diagnostics, deterministic note lint, fresh-agent behavior cases, and an Obsidian
editing round trip answer different questions. Neither a populated index nor valid YAML
proves sourced claims correct. See [knowledge quality](knowledge-quality.md).
