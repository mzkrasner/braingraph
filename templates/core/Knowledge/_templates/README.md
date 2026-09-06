# Page Metadata

Keep metadata flat, small, and editable as Obsidian properties. Templates are starting shapes, not claims: replace placeholder dates when creating a real note. Omit optional fields whose dates or values are unknown; do not invent a date, use `not-checked` as a date, or set every date to today.

| Field                         | Meaning                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created`, `updated`          | Creation and edit dates of this local note.                                                                                                                 |
| `last_reviewed`               | Date the local synthesis was reviewed; does not refresh external facts.                                                                                     |
| `observed_at`                 | Date of the event or observation described by the evidence.                                                                                                 |
| `retrieved_at`                | Date the evidence was actually obtained.                                                                                                                    |
| `last_verified`               | Date an authoritative source was actually checked for the stated verification scope.                                                                        |
| `verification_scope`          | The specific claims checked, not an unqualified whole-note badge.                                                                                           |
| `verification_limits`         | Unchecked portions, inaccessible sources, contradictions, or other limits.                                                                                  |
| `evidence_status`             | `sourced`, `reported`, `inferred`, `mixed`, or `unverified`.                                                                                                |
| `source_path`, `source_paths` | Optional existing source path or list of paths, relative to this vault and contained inside it. Use stable source IDs/URLs for external references instead. |

Use real ISO dates (`YYYY-MM-DD`); quote date strings when another YAML tool would otherwise coerce them. Evidence status describes provenance, not certainty: `sourced` can still be incomplete or contradicted. A claim repeated by a person is `reported`, not directly verified; agent interpretation is `inferred`. `mixed` requires a body-level explanation of which evidence supports which claims.

For example, a fictional note might contain:

```yaml
evidence_status: mixed
observed_at: "2026-02-03"
retrieved_at: "2026-02-06"
last_verified: "2026-02-06"
verification_scope: Service names on the dated public catalog only.
verification_limits: Membership status is a person's report; no authenticated registry check.
```

For multiple claims, keep precision in the body rather than creating nested property objects:

| Claim                                   | Evidence and revision      | Provenance | Verification and limits                                 |
| --------------------------------------- | -------------------------- | ---------- | ------------------------------------------------------- |
| The catalog lists design services.      | Public catalog, revision 4 | Sourced    | Checked February 6; proves only what the catalog lists. |
| Membership was approved.                | February 3 conversation    | Reported   | Not checked in the membership registry.                 |
| Those services may fit a buyer's needs. | Comparison with a request  | Inferred   | Hypothesis; no buyer confirmation.                      |

## Decisions

Use `type: decision` for a dedicated record. `status` is `proposed`, `accepted`, `implemented`, `rejected`, or `superseded`. Keep `proposed_at`, `accepted_at`, and `implemented_at` distinct and set each only when supported. Record who accepted what and cite the implementation evidence. Never infer implementation from acceptance or use a decision record as an execution permission.

Existing notes need not gain every optional field. Improve metadata when a note is meaningfully reviewed; do not bulk-rewrite history for cosmetic consistency. Deterministic lint checks syntax and references, not truth or completeness of evidence.
