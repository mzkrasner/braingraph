# Agent Compatibility

Braingraph supports Codex, Claude Code, Cursor, and Grok Build without maintaining four copies of its operating rules.

## Canonical Layout

- A scoped `AGENTS.md` is the only source of standing instructions for that directory.
- `.agents/skills/<skill>/SKILL.md` is the only source of reusable project-skill behavior.
- A sibling `CLAUDE.md` contains only `@AGENTS.md`. It is a discovery adapter, not an instruction file to edit independently.
- Braingraph does not generate `.cursor/rules`, `.claude/skills`, `.cursor/skills`, or `.grok/skills` mirrors.

Nested `AGENTS.md` files remain intentional. They add narrower instructions for the knowledge vault or a repository hub instead of copying root policy.

## Client Behavior

| Client      | Standing instructions                               | Project skills                                            | Braingraph behavior                                                                                          |
| ----------- | --------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Codex       | Reads scoped `AGENTS.md`                            | Discovers `.agents/skills`                                | Uses both canonical locations directly                                                                       |
| Cursor      | Reads `AGENTS.md`                                   | Discovers `.agents/skills`                                | Uses both canonical locations directly; no Cursor rules are generated                                        |
| Grok Build  | Walks the `AGENTS.md` family to the repository root | Discovers `.agents/skills` and vendor-compatible catalogs | Uses both canonical locations directly; no Grok rules or skills are generated                                |
| Claude Code | Reads scoped `CLAUDE.md`, not `AGENTS.md`           | Natively discovers `.claude/skills`                       | Imports canonical instructions through `CLAUDE.md` and follows their file-read protocol for `.agents/skills` |

The file-read protocol requires a client that does not natively surface `.agents/skills` to enumerate the skill entrypoints, inspect their frontmatter, and read the complete relevant `SKILL.md` before acting.

This provides semantic compatibility: a natural-language setup or maintenance request reaches the same instructions and procedures in every supported client. Braingraph intentionally does not promise identical vendor-specific slash menus. Mirroring skills merely to populate those menus would create drift and, because Cursor and Grok Build scan several vendor skill directories, duplicate discovery.

Grok Build also reads top-level `CLAUDE.md` for compatibility. Because the Braingraph adapter contains only the literal `@AGENTS.md` pointer, Grok receives no duplicated policy body from that second file.

## Adapter Rules

1. Put shared policy in the nearest canonical `AGENTS.md`.
2. Put reusable procedures in `.agents/skills`.
3. Keep `CLAUDE.md` equal to `@AGENTS.md`; use another scoped `AGENTS.md` when narrower policy is needed.
4. Add a vendor-specific file only for behavior that cannot be represented by the canonical formats.
5. A vendor-specific adapter must point to canonical material and must not restate it.
6. If a vendor requires a duplicated skill body for a future capability, generate and verify it mechanically rather than editing both copies.

`braingraph doctor` verifies the canonical instruction files, the Claude import bridges, and duplicate skill names in vendor-specific catalogs. Duplicate names are warnings because an intentionally client-specific skill may exist, but they require review.

## Verification

- Run `braingraph doctor <workspace>` after initialization or adapter changes.
- In Grok Build, run `grok inspect` to inspect discovered instructions and extensions. Other packages also install executables named `grok`; first confirm that `grok --help` lists the `inspect` command.
- In each client, ask it to identify the canonical standing instructions and the relevant skill for a setup request. The answer should point to `AGENTS.md` and `.agents/skills`, even when the client reached them through an adapter.

Primary client references:

- [Claude Code project memory and `AGENTS.md` imports](https://code.claude.com/docs/en/memory)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Cursor Agent Skills](https://cursor.com/docs/context/skills)
- [Cursor CLI instruction files](https://docs.cursor.com/en/cli/using)
- [Grok Build skills and compatibility](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- [Grok Build `AGENTS.md`](https://docs.x.ai/build/features/agents-md)
- [Grok Build source: instruction discovery](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-agent/src/prompt/agents_md.rs)
- [Grok Build source: skill discovery](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-agent/src/prompt/skills.rs)
