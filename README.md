# Braingraph

**Open-source AI knowledge management for building an Obsidian second brain and Markdown knowledge base that humans and AI agents can maintain together.**

Braingraph scaffolds a durable, searchable workspace for a person, project, organization, or domain. It configures Obsidian as the human interface and QMD as the agent retrieval layer, then generates the taxonomy, source-of-truth rules, privacy boundaries, and agent instructions needed to keep knowledge useful over time.

Braingraph does not bundle an AI model or lock knowledge inside a proprietary database. It gives the AI agents you already use a portable Markdown workspace that remains readable without Braingraph, Obsidian, QMD, or a particular agent vendor.

## What Braingraph Sets Up

- An Obsidian second brain with durable navigation, templates, sources, projects, domains, and reusable knowledge.
- A Markdown knowledge base optimized for both human editing and AI agent retrieval.
- QMD semantic search with collection boundaries and workspace-purpose context.
- Agent instructions for provenance, source ownership, privacy, maintenance, and taxonomy evolution.
- Vendor-neutral contracts for issue trackers, file stores, messaging, CRMs, and other external systems.
- An optional software profile for repository coordination and guarded Git worktree management.
- A single-source agent contract for Codex, Claude Code, Cursor, and Grok Build.

## Use Cases

- Building an AI second brain for personal knowledge management and recurring project work.
- Team AI knowledge management with explicit sources of truth and human review boundaries.
- Durable project context for coding agents working across repositories and worktrees.
- A shared AI agent workspace that can evolve as tools, projects, and operating practices change.

## Principles

- Markdown files are canonical; Obsidian state and QMD indexes are rebuildable.
- Each kind of information has one declared source of truth.
- External systems are registered by behavior, not hardcoded by vendor.
- Durable synthesis is kept separate from raw sources, live execution state, and temporary artifacts.
- Agents search before creating, preserve provenance, surface contradictions, and propose consequential taxonomy changes before applying them.
- External writes, destructive actions, and broad reorganizations require explicit human approval.
- Software repositories and worktrees are an optional extension of the broader knowledge workspace.

## Quick Start

```bash
git clone https://github.com/mzkrasner/braingraph.git
cd braingraph
corepack enable
pnpm install
pnpm build
node dist/bin.js init ~/Projects/example --name "Example" \
  --description "Durable product and operating knowledge for Example." \
  --scope project \
  --sensitivity private \
  --maintenance-mode proposal-first
node dist/bin.js tools install ~/Projects/example --dry-run
node dist/bin.js qmd configure ~/Projects/example --dry-run
```

After reviewing those plans, run `tools install` with `--execute`, then repeat `qmd configure` without `--dry-run`. QMD configuration adds the workspace purpose as collection context. `braingraph doctor` verifies the resulting Obsidian and QMD setup.

Enable the optional software profile:

```bash
node dist/bin.js init ~/Projects/example \
  --name "Example" \
  --profile software
```

Every mutating command supports `--dry-run`.

## Agent-Led Setup

Ask an agent working in this repository:

> Set up a Braingraph workspace for me.

The agent must follow `.agents/skills/setup-braingraph/SKILL.md`: understand the intended scope, identify privacy and external-system boundaries, map the directories where agents actually work, propose a setup and discovery matrix, obtain approval, run a dry run, and only then create the workspace. The setup location is not inferred from the Braingraph clone or current shell directory.

Setup is also a product-learning surface. Agents should identify repeatable friction or assumptions that fail to generalize, distinguish those gaps from local configuration problems, and prepare a structured issue for [Braingraph Issues](https://github.com/mzkrasner/braingraph/issues). They must search for duplicates, remove machine-specific or sensitive context, show the draft to the user, and obtain explicit approval before filing it.

## Agent Compatibility

Braingraph uses one canonical instruction and skill model across supported coding agents:

- Scoped `AGENTS.md` files own standing instructions.
- `.agents/skills/<skill>/SKILL.md` owns reusable project-skill behavior.
- Import-only `CLAUDE.md` files let Claude Code consume the matching `AGENTS.md` without copied policy.
- Codex, Cursor, and Grok Build use both canonical locations directly.
- Claude Code uses the import bridge and follows the same skill-loading protocol.

Braingraph does not generate parallel `.cursor/rules`, `.claude/skills`, or `.grok/skills` catalogs. This avoids policy drift and duplicate skill discovery while preserving the same natural-language workflows across clients. Vendor-specific slash-menu parity is intentionally secondary to semantic compatibility.

See [`docs/agent-compatibility.md`](docs/agent-compatibility.md) for the complete contract and verification guidance.

## Commands

```text
braingraph init [directory] [options]
braingraph doctor [directory] [--json]
braingraph tools install [directory] [--dry-run | --execute]
braingraph obsidian open [directory] [--dry-run | --execute]
braingraph qmd configure|refresh [directory] [options]
braingraph system add|update <id> [options]
braingraph repo add|attach|remove <id> [options]
braingraph worktree new <repository> <name> [options]
braingraph worktree inspect <repository> <name> [--json]
braingraph worktree remove <repository> <name> [options]
```

Run `braingraph <command> --help` for details.

## External Systems

External systems are optional entries in `braingraph.json`. Each entry records:

- whether it is active, planned, or retained inactive for provenance;
- what the system owns;
- its role in the workspace;
- the stable record identifiers agents must preserve;
- read and write boundaries;
- freshness expectations;
- whether knowledge should be linked, summarized, synchronized, or excluded;
- sensitivity rules; and
- fallback behavior when access fails or evidence conflicts; and
- connector-specific notes when relevant.

This model supports issue trackers, file stores, messaging systems, CRMs, email, calendars, source control, databases, or future tools without making any one vendor foundational.

Changed integrations are updated in place. Prospective integrations are marked planned, and retired integrations are marked inactive instead of being erased. This preserves provenance while allowing tools and ownership boundaries to evolve.

See `docs/obsidian-and-qmd.md` for the shared Obsidian/QMD boundary and `docs/external-systems.md` for the vendor-neutral integration contract.

## Software Profile

The software profile adds repository governance hubs and two explicit integration modes. It does not prescribe a `dev`/`main` branch model; each repository declares its own integration and optional production branch.

- `repo add` creates a Braingraph-managed bare anchor, stable integration worktree, and isolated feature-worktree hub.
- `repo attach` registers an existing checkout without rewriting its Git layout. Portable identity stays in `braingraph.json`; the absolute checkout path stays in ignored, permission-restricted `braingraph.local.json`.
- An attachment can create ignored local `AGENTS.md` and `CLAUDE.md` discovery bridges. A bridge applies only to that exact checkout, not sibling worktrees or other clones. Use `--no-bridge` when repository-native root instructions already exist, then connect those instructions to the canonical workspace deliberately.
- `repo remove` deregisters either mode only after exact confirmation. It preserves hubs, checkouts, bridges, worktrees, and branches so recovery remains possible.

Every remote and branch is validated before registration. Managed Git internals and child worktrees are ignored by the outer workspace repository while hub governance files remain trackable.

Before setup is considered complete, validate agent discovery from the human's normal project root and representative checkouts and worktrees. The coordination root, Obsidian knowledge root, and Git checkout roots are distinct concepts even when a simple installation places them under one directory.

Worktree cleanup is inspection-first and never automatic. Removal requires a clean worktree, an exact confirmation token, an allowed reason, and `--execute`. It does not delete branches or use force removal.

Destructive removal also requires a positive process-safety check. Braingraph uses `lsof` on macOS and Linux and fails closed when inspection is unavailable; Windows currently supports inspection and dry-run but not `--execute` removal because no equivalent built-in process check is available.

See [`docs/repositories.md`](docs/repositories.md) for setup, attachment, portability, and recovery details.

## Ongoing Knowledge Loop

Braingraph is designed to evolve during normal work, not only during dedicated note-taking sessions. Generated instructions tell agents to detect durable decisions, changed source revisions, contradictions, and reusable knowledge at meaningful milestones.

- A direct request to ingest, document, update, or maintain the second brain authorizes the scoped local Markdown work.
- During other work, agents in proposal-first mode propose a compact maintenance packet before ending.
- A narrow delegated maintenance scope can permit routine local Markdown updates and is persisted in `braingraph.json` for fresh agents.
- External writes, destructive actions, sensitive disclosures, and consequential taxonomy changes remain approval-gated.

Raw intake is ignored by Git by default. Durable synthesis, provenance, and sanitized dated reports remain separate from raw source artifacts and live execution state.

## Development

Braingraph requires Node.js 22 or later and pnpm 9. Its published CLI intentionally has no runtime dependencies. The source uses strict TypeScript, ESLint, Prettier, and Vitest; generated vaults do not require Braingraph to remain installed.

```bash
pnpm qa
```

Use `pnpm dev -- <command>` while developing, or `pnpm build` followed by `node dist/bin.js <command>` to exercise the packaged entrypoint.

## License

Braingraph is available under the [MIT License](LICENSE).
