# Knowledge quality

Braingraph has three separate verification layers. Passing one does not prove the next.

| Layer          | Check                                                 | What it proves                                                                                                                              |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup health   | `braingraph doctor /path/to/brain`                    | Declared artifacts, configuration, instruction bridges, and QMD runtime checks are healthy.                                                 |
| Note structure | `braingraph knowledge lint /path/to/brain --json`     | Checked local notes have valid declared metadata, bounded source paths, and resolvable supported links.                                     |
| Agent behavior | Fresh-agent cases in the generated `Knowledge/evals/` | The tested agent can use evidence, scope, and approval boundaries in representative tasks. Results apply to that tested client/model/setup. |

The lint command is read-only and independent of QMD and Obsidian. It walks only the
selected vault and refuses filesystem links instead of following them into another
brain. Raw intake, note templates, evaluation fixtures, and canonical agent instruction
files are not treated as governed notes. They may deliberately contain examples or
unprocessed material. Files larger than 2 MiB are flagged for review.

## Metadata

Frontmatter is ordinary YAML, including quoted strings, lists, and block scalars.
Duplicate keys, unresolved tags, aliases, and malformed/non-mapping frontmatter fail
lint. The parser is bundled; Python or a consumer YAML installation is not required.
Only declared fields are checked: absence of optional metadata does not invent a fact
or force a wholesale migration of older notes.

- `observed_at`: when the underlying event or state was observed, if known.
- `retrieved_at`: when the source content was obtained.
- `last_verified`: when the stated claims were checked against their authority.
- `verification_scope` and `verification_limits`: what that check did and did not establish.
- `last_reviewed`: review of the note itself, not fresh verification of live state.
- `evidence_status`: `sourced`, `reported`, `inferred`, `mixed`, or `unverified`.

Date fields accept real `YYYY-MM-DD` dates and ISO timestamps, including Obsidian's
timezone-free Date & time property format. A missing timezone stays unknown. Ordering
checks compare only day-only dates with day-only dates, or timezone-qualified timestamps
with other qualified timestamps; they do not invent midnight or a timezone for mixed values.
Omit unknown dates rather than entering `today`, `unknown`, or a guessed timestamp.
For mixed evidence, use a claim/evidence table in the body; do not spread one verified
date across claims that were not checked. A lint pass cannot establish that a source
supports a claim or that a recorded verification actually happened.

Decision notes use `type: decision` and `status: proposed | accepted | implemented |
rejected | superseded`. Record `accepted_at` and `implemented_at` only with the
corresponding evidence. Lint checks known date order and flags missing event dates;
agents still review who approved what and whether implementation was demonstrated.

## Sources and links

Optional `source_path` and `source_paths` name files relative to this vault. They must
exist and remain within its filesystem boundary. Use a source URL and stable external
record/revision identifiers when retaining a local copy is unnecessary or prohibited.
Do not confuse an unavailable source with permission to search another brain/account.

The current link check covers Obsidian wikilinks and embeds, including aliases and
file-level targets before heading/block anchors. It ignores fenced/inline code.
Missing and ambiguous destinations are warnings (a deliberately future note may be
valid); escaping paths are errors. Anchor existence, full CommonMark parsing, external
URL availability, and semantic correctness are not checked. Use explicit vault-relative
paths to resolve ambiguous basenames. Review warnings before calling maintenance complete.

## Human-interface acceptance

Run the generated Obsidian round-trip checklist in a disposable fictional vault:
open the vault by folder, insert a template, edit metadata in Properties, rename a
linked note, confirm links update, and retrieve the edited content after refresh.
`obsidian open --execute` only dispatches a URI; it does not prove the app registered
the vault or that editing works. A headless test must report that GUI acceptance was
not performed, rather than marking it passed.

Keep failures as small sanitized regression cases. Do not publish real inbox excerpts,
customer information, credentials, account identifiers, or proprietary knowledge as examples.
