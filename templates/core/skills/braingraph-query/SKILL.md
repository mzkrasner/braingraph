---
name: braingraph-query
description: Answer questions from this Braingraph workspace with source citations, explicit freshness, and uncertainty. Use for finding notes, orientation, or synthesizing existing knowledge; it does not authorize writes or searching other brains.
---

# Query This Brain

Resolve this skill's workspace root (three directories above its folder), then read that root's `braingraph.json`, `AGENTS.md`, and `{{KNOWLEDGE_DIR}}/AGENTS.md`. Verify it is the brain named or placed in scope by the user. Stop on ambiguous workspace or account identity; do not substitute another brain with a similar name.

Use `{{KNOWLEDGE_DIR}}/index.md` and relevant project/domain hubs to orient. Search within this brain only, retrieve full relevant sections, and follow supporting source references. Read governance and source registries directly; they are deliberately outside semantic ranking. If QMD is absent or stale, use Markdown and exact filesystem search and state the retrieval limitation.

For material claims, distinguish what the source says, what a person reported, and what you infer. Check source revisions, observation dates, actual verification scope, and unresolved contradictions. A current local review date, successfully fetched page, or old report does not establish current external state. For volatile facts, verify the declared live owner through the correct account if permitted; otherwise give the dated knowledge and the precise gap.

Answer with supporting Markdown or audience-accessible source citations. Explain relevant conflicts and uncertainties; don't resolve them by silently picking the newest prose. Accepted decisions are not proof of implementation. Another brain's records are not corroboration unless the user explicitly placed them in scope and their source identity is retained.

Answer-only requests do not authorize saving a synthesis, moving files, refreshing configuration, or contacting anyone. If useful durable knowledge emerges, follow the manifest's maintenance boundary rather than expanding the request.
