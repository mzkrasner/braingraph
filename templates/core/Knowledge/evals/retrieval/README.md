# Retrieval Evaluations

Store fictional or sanitized retrieval cases here after meaningful taxonomy or search-routing changes. Evaluation fixtures test whether agents can find the intended canonical pages without indexing governing files, raw sources, or sensitive material.

Prefer a small `qmd bench` JSON fixture containing a description, version, configured collection, and queries with:

- a stable `id`;
- the human query;
- a type such as `exact`, `semantic`, `topical`, `cross-domain`, or `alias`;
- a short description of the retrieval behavior;
- expected collection-relative files; and
- the number expected within the top results.

Add a case after a real miss, alias failure, or consequential taxonomy change. Do not manufacture a large synthetic suite that no one will maintain. Run `qmd bench <fixture.json> -c <collection>` after refreshing embeddings and record only durable conclusions, not model caches or raw benchmark output.
