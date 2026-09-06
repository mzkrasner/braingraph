---
name: braingraph-maintain
description: Audit or maintain this Braingraph workspace for stale claims, provenance gaps, contradictory decisions, broken navigation, or retrieval drift. Use for knowledge-health reviews and scoped approved repairs; diagnostics alone do not authorize reorganizing the graph.
---

# Maintain This Brain

Resolve this skill's workspace root (three directories above its folder) and read its `braingraph.json`, `AGENTS.md`, and `{{KNOWLEDGE_DIR}}/AGENTS.md`. Establish the bounded area and whether the user requested diagnosis or authorized changes. Never apply one brain's maintenance policy to another.

Use three distinct evidence layers:

- **Setup health:** `braingraph doctor <workspace>` checks registered configuration and integrations. Missing tools mean degraded capabilities, not missing knowledge.
- **Deterministic note checks:** `braingraph knowledge lint <workspace> --json` checks parseable metadata, dates, source references, and links. These checks cannot decide whether evidence is true or taxonomy makes sense.
- **Semantic and behavior review:** retrieve relevant complete sources and inspect contradictions, stale or oververified claims, aliases, duplicate concepts, unrelated ideas combined into one page, orphans, index drift, undeveloped concepts, unprocessed revisions, and proposed decisions mislabeled as implemented. Use `{{KNOWLEDGE_DIR}}/evals/behavior/README.md` for isolated fictional behavior checks after meaningful workflow changes.

For a finding, record the exact file or source, consequence, supported correction, and uncertainty. Verify volatile evidence in its owner using the declared account; an unavailable source remains a gap. Do not update verification dates merely because a local review occurred. Evaluate repeated retrieval misses against actual expected pages after refreshing the correct index.

When changes are authorized, preserve unrelated files and history. Apply routine local repairs only within the request or manifest's delegated scope; taxonomy, external writes, destructive operations, and disclosure changes need separate approval. Before a taxonomy change, establish owner, outcome, lifecycle, and boundary; distinguish genuine project separation from a conceptual cross-link. Then update only affected pages, instructions, navigation, retrieval masks, and evaluations.

Record successful changes in `log.md`, recheck the affected area, and report remaining gaps. Do not impose calendar-based rewrites: use source changes, project transitions, repeated misses, or accumulated inconsistencies as review triggers. Background refresh is optional, per brain, and requires its own setup authorization; it must not perform knowledge synthesis or external business actions.
