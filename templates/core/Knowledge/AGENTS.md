# Second Brain Operating Guide

Markdown is canonical. This is one maintained graph of durable knowledge, not a transcript archive or an external-system mirror. The parent workspace guide and `{{WORKSPACE_ROOT_RELATIVE}}/braingraph.json` govern scope and permissions.

## Structure

- `projects/`: one canonical hub per bounded initiative, outcome, and lifecycle.
- `domains/`: enduring responsibilities or subjects without a completion state.
- `wiki/`: reusable atomic knowledge and genuine concept hubs; decision records may live alongside the concepts they govern.
- `raw/`: unsynthesized intake; `raw/processed/` preserves successfully processed inputs.
- `sources/`: source identities, revision ledgers, provenance, and processing state, not copied source content.
- `reports/`: sanitized immutable dated snapshots, never unstated current-state owners.
- `evals/`: operational retrieval and behavior fixtures, not canonical knowledge.
- `_templates/`: page shapes and metadata guidance, not knowledge.
- `index.md`: curated navigation. `log.md`: append-only maintenance history.

## Durable Knowledge And Provenance

- Search before creating a page. Prefer updating an existing concept or adding a meaningful `[[wikilink]]` to inventing a category.
- Preserve attribution, contradictions, exclusions, and uncertainty. Distinguish directly sourced evidence, a person's report, and agent inference; none silently becomes another.
- Use source identity and revision where available. `observed_at` is the event or observation date, `retrieved_at` is when evidence was obtained, and `last_verified` is when the owning source actually verified the stated claim. `last_reviewed` dates local synthesis review and does not refresh external facts.
- A fetched page does not verify every claim in a note. State `verification_scope` and `verification_limits`; use claim-level evidence in the body for mixed provenance. Never invent dates or mark a failed or indirect check as verification.
- Flat metadata remains editable in Obsidian. Read `_templates/README.md` when creating or repairing metadata; omit optional unknown or inapplicable fields instead of filling them with today's date.
- Record decisions as proposed, accepted, and implemented separately. Human acceptance is not implementation, and neither is authorization for an external action. Use `_templates/Decision.md` when a decision merits its own record; smaller decisions may remain in their project hub with the same distinctions.
- Keep live roles, priorities, metrics, and execution status in their owning system; a dated snapshot may explain a durable decision. A project's coarse `status` is not a synchronized execution tracker.

## On-Demand Workflows

Load the full matching skill at `{{WORKSPACE_ROOT_RELATIVE}}/.agents/skills/`:

- `braingraph-query/SKILL.md`: retrieve complete sources, answer with citations and freshness limits; no implied knowledge writes.
- `braingraph-ingest/SKILL.md`: compare sources with this brain, apply scoped authorized synthesis, then update the source ledger.
- `braingraph-maintain/SKILL.md`: diagnose structure, provenance, retrieval, and stale claims; apply only authorized changes.

Follow the manifest's maintenance policy at meaningful milestones. Surface durable decisions, clarified boundaries, changed source revisions, or important contradictions. Do not promote transient task status, raw conversation recaps, or speculative conclusions. Diagnostic requests do not authorize a rewrite.

Taxonomy changes need evidence for owner, outcome, lifecycle, and boundary, followed by explicit approval. Shared terminology alone does not make two initiatives one project; aliases for one concept do not need parallel pages. Do not migrate unrelated history for cosmetic consistency.

{{QMD_RETRIEVAL_SECTION}}
