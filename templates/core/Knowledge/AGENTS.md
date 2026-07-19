# Second Brain Operating Guide

This knowledge base is a maintained, agent-first wiki. Markdown is canonical. Treat it as a coherent graph of durable knowledge, not a pile of summaries.

## Structure

- `projects/` contains one canonical hub per initiative with a distinct outcome and lifecycle.
- `domains/` contains durable areas of responsibility or inquiry without a defined completion state.
- `wiki/` contains atomic, reusable knowledge pages and genuine concept hubs.
- `raw/` contains unsynthesized source material; `raw/processed/` preserves successfully processed inputs.
- `sources/` contains source identities, revision ledgers, provenance, and processing state rather than copied source content.
- `reports/` contains sanitized, immutable dated snapshots and diagnostic reviews.
- `evals/` contains retrieval fixtures. It is operational test data, not canonical knowledge.
- `_templates/` contains page shapes and is not knowledge.
- `index.md` is a curated navigation map.
- `log.md` is the append-only knowledge-maintenance history.

## Information Architecture

Taxonomy is a claim about the world, not a filing convenience. Before adding a hierarchy, project, domain, hub, split, or merge, establish the evidence for its owner, outcome, lifecycle, and boundary.

Use these roles:

- **Project hub:** a bounded initiative with an intended outcome and decision cadence.
- **Domain hub:** an ongoing responsibility or subject without a completion state.
- **Concept hub:** an organizing idea that connects several meaningful subtopics without implying common ownership.
- **Atomic page:** one reusable system, workflow, term, policy, principle, or idea.
- **Source registry:** what was reviewed, at which source revision, and what changed.

Before changing taxonomy:

1. Search and retrieve the complete related pages.
2. Inspect any authoritative external source that establishes the relationship.
3. Decide whether the information updates an existing page, creates an atomic page, creates a project/domain, or only adds a cross-link.
4. Prefer a new project when ownership, outcome, lifecycle, system boundary, or acceptance process differs.
5. Prefer a conceptual link when only terminology, tooling, or subject matter is shared.
6. Keep current roles, priorities, and metrics dated and sourced.
7. When the structure is materially uncertain, present a taxonomy proposal and wait for human approval.

Do not create parallel pages for aliases describing one concept. Do not collapse separate initiatives merely because they share a word or tool.

## Sources And External Systems

Read `../braingraph.json` before using an external system. Its registry declares ownership, access, freshness, capture, and sensitivity.

- Link and summarize when the external system should retain ownership.
- Copy only when this workspace is explicitly intended to own the material.
- Verify volatile claims in their live owner.
- Record stable source identifiers and revisions when available.
- If a connector is unavailable, report the gap and use an approved fallback; do not invent or silently substitute evidence.
- A successful read does not authorize a write.

## Project Hubs

Each active or completed initiative should have exactly one canonical page under `projects/`. Use `_templates/Project.md`.

Project pages synthesize objective, scope, decisions, open questions, knowledge links, and canonical sources. They must not mirror entire ticket backlogs, pull-request histories, message threads, or raw source documents.

Keep volatile status out of durable prose. Link to the live owner. When a dated snapshot materially explains a decision, save a sanitized report and label its date and source revision.

## Domain Hubs

Use `domains/` for responsibilities and areas that persist across multiple projects. A domain can link to related projects without claiming their execution state. Use `_templates/Domain.md`.

## Ingestion

When asked to ingest source material:

1. Identify unprocessed sources and their stable identities or revisions.
2. Read selected sources completely enough to avoid silent omission.
3. Inspect directly linked authoritative material that materially supports or contradicts the durable claims.
4. Classify content as durable, volatile, sensitive, duplicative, inaccessible, or out of scope.
5. Search existing projects, domains, and wiki pages before creating anything.
6. Prepare a review packet describing proposed updates, conflicts, exclusions, affected files, and any taxonomy proposal.
7. Apply only the changes the human approves when review is required by the source or workflow.
8. Update the source ledger and `log.md` after successful application.
9. Move local raw source files to `raw/processed/`; never delete them implicitly.

Do not ingest credentials, sensitive personal records, regulated data, or volatile operational trackers merely because they are accessible.

## Retrieval

- Search for candidate pages, then retrieve complete relevant sections before making factual claims.
- Cite underlying Markdown pages or external sources, never a search index as authority.
- Separate sourced fact, existing interpretation, and new inference.
- Surface conflicts, weak evidence, freshness concerns, and important gaps.
- Save a new synthesis only when the human asks or clearly approves the write.

{{QMD_RETRIEVAL_SECTION}}

## Knowledge Maintenance

When linting the knowledge base, report contradictions, stale claims, orphans, broken links, duplicate pages, index drift, undeveloped concepts, and pages that combine unrelated ideas. Linting is diagnostic; do not reorganize knowledge without separate approval.

Taxonomy changes are infrequent maintenance events. After an approved change, update only affected instructions, navigation, retrieval masks, and evaluation fixtures. Do not bulk-migrate unaffected history for cosmetic consistency.

## Knowledge-Quality Rules

- Preserve source attribution and uncertainty.
- Use descriptive, stable filenames and meaningful `[[wikilinks]]`.
- Keep metadata small and operationally useful.
- Do not fabricate sources, dates, quotations, consensus, or relationships.
- Keep project and domain hubs concise enough to orient a fresh agent.
- Move reusable detail into atomic wiki pages.
- Never place credentials or prohibited sensitive data in the knowledge base.
