# Braingraph

Braingraph scaffolds a durable, agent-first second brain that can grow alongside a person, project, organization, or domain.

The generated workspace is an Obsidian vault backed by ordinary Markdown, with QMD configured as its agent retrieval layer. Braingraph helps install both tools, establishes their shared taxonomy and search boundaries, and keeps the Markdown usable even when either application is closed. Software worktree management can be enabled when relevant.

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
git clone <braingraph-repository>
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

The agent must follow `.agents/skills/setup-braingraph/SKILL.md`: understand the intended scope, identify privacy and external-system boundaries, propose a setup, obtain approval, run a dry run, and only then create the workspace.

## Commands

```text
braingraph init [directory] [options]
braingraph doctor [directory] [--json]
braingraph tools install [directory] [--dry-run | --execute]
braingraph obsidian open [directory] [--dry-run | --execute]
braingraph qmd configure|refresh [directory] [options]
braingraph system add|update <id> [options]
braingraph repo add <id> [options]
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

The software profile adds repository hubs and guarded worktree commands. It does not prescribe a `dev`/`main` branch model; each repository declares its own integration and production branches.

Worktree cleanup is inspection-first and never automatic. Removal requires a clean worktree, an exact confirmation token, an allowed reason, and `--execute`. It does not delete branches or use force removal.

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
