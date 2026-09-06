# Upgrading an existing brain to template contract 2

New workspaces receive template contract 2. Manifest schema version 1 remains readable,
including external systems without identity fields. Missing identity bindings are not
permission to use a default account. Existing workspaces are **not** silently rewritten
or marked upgraded by `init`; their original `templateVersion` remains until a reviewed
migration is complete.

This is an agent-led, reviewable upgrade, not a migration engine. Repeat it independently
for each brain. Updating the Braingraph product clone does not authorize modifications
to every brain on the machine.

1. Identify the exact target root and read its canonical instructions and manifest.
   Record current `templateVersion`, custom knowledge-directory name, sensitivity,
   external-system ownership, and local-maintenance permissions. Do not infer the target
   from the clone, another task's current directory, or a global “active brain.”
2. Run `doctor` and `knowledge lint` for that explicit target. Capture existing failures
   separately from upgrade changes. Pause only the target brain's scheduled refresh
   if one is configured; do not alter machine-wide schedules.
3. Back up the **exact canonical files that will change** using a local commit or a
   permission-preserving copy to a user-approved private backup location. Include ignored
   local bindings if changing them; never add them to Git. Do not copy private data into
   the product repository or use the public fictional examples as a backup destination.
4. Generate a comparison scaffold in a new, empty sibling directory, using the same
   purpose, knowledge directory, scope, sensitivity, and maintenance settings. Use `init
--dry-run` first; do not configure tools or connect accounts for this comparison.
   Compare the candidate `AGENTS.md`, skills, templates, schema, and vault settings
   against the target. Produce a file-by-file proposal explaining preserved custom rules.
5. With approval, merge only the selected changes. New ingest/query/maintain skills and
   the Decision template are additive. Replace copied policy with canonical imports only
   where that preserves the existing meaning. Keep human-authored taxonomy, source
   ownership, note content, and permissions. Re-running `init` may create missing files
   but deliberately preserves existing instructions and therefore is not a complete upgrade.
6. Declare expected account/tenant identities in the manifest when relevant, then bind
   the corresponding local connector in this brain only. Recheck its fresh authenticated
   identity before use. Do not copy another brain's `braingraph.local.json` or `.qmd/`.
7. Inspect any existing `.qmd/index.yml` or `.yaml`. The target's local index must contain
   only its declared collection. Review unexpected collections or path overrides before
   rebuilding; never “fix” an ancestor/global index as an implied step. Run target-scoped
   `qmd configure --dry-run`, then configure after reviewing the plan.
8. Run `doctor`, `knowledge lint`, the fictional two-brain behavior cases, and the Obsidian
   editing round trip. Check a representative operational launch directory too. Resolve
   failures or report explicit limitations. Only then set `templateVersion` to `2` in the
   target manifest, as part of the reviewed change. Run checks once more and resume only
   the target's previously authorized schedule.

Metadata upgrades are incremental: do not fabricate historical observation, retrieval,
verification, acceptance, or implementation dates to populate new fields. Add what can be
supported during future authorized maintenance.

## Recovery

Stop the affected target's refresh task, restore only the backed-up canonical files and
local binding file that this upgrade changed, and restore the previous template-version
claim. Rebuild that brain's disposable QMD index from its restored Markdown/configuration
after reviewing a configure plan. Keep unrelated brains, their connectors, schedules,
repositories, and global model caches untouched. Retain the backup until the human has
accepted the resulting workspace.
