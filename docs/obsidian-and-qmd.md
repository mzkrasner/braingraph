# Obsidian And QMD

Braingraph configures two views over one canonical Markdown knowledge base.

## Obsidian

Obsidian is the human-facing application. Braingraph creates a vault configuration that:

- keeps new unclassified notes in `raw/`;
- stores attachments in `raw/attachments/`;
- keeps page templates in `_templates/`;
- maintains wiki links when files are renamed; and
- enables only Obsidian core plugins, avoiding a mandatory community-plugin stack.

Local window and workspace state is ignored because it is personal, volatile, and unrelated to durable knowledge. Braingraph can open `Start Here.md` through the official `obsidian://open?path=...` URI after explicit approval.

## QMD

QMD is the agent-facing discovery layer. Braingraph registers one collection per workspace and indexes only:

- project hubs;
- domain hubs;
- reusable wiki knowledge; and
- sanitized reports.

Governing files, navigation, source registries, raw material, templates, retrieval fixtures, Obsidian state, credentials, and sensitive source artifacts remain outside semantic ranking. Agents read those files directly when their role is relevant.

`braingraph qmd configure` requires a supported QMD 2.x release when QMD is installed, initializes a workspace-local index, installs QMD's version-matched agent skill in the canonical `.agents/skills` catalog, registers the collection, adds or updates the manifest's workspace description as collection context, updates the index, and creates embeddings. Its dry run works before QMD is installed. Re-run configuration after changing the workspace description; `braingraph doctor` warns when the registered purpose is stale. `braingraph qmd refresh` updates the existing local index after later knowledge changes and refuses to run before configuration. Claude Code, which does not natively discover `.agents/skills`, reaches the QMD skill through the file-read protocol in the imported canonical `AGENTS.md`.

Braingraph runs every QMD operation from the selected workspace root and normalizes the child's `PWD`; a shell's stale `PWD` must never initialize a different brain. QMD stores that workspace's configuration and SQLite index under ignored `.qmd/`, outside the Markdown vault; shared downloaded model caches may remain in QMD's user cache. There is no global “active brain” registry. Two brains may even use the same collection name because their indexes are separate. Give commands an explicit directory when working with more than one brain.

Braingraph refuses inherited `INDEX_PATH`, `QMD_CONFIG_DIR`, and `QMD_SKILLS_DIR` overrides, missing local configuration after initialization, ambiguous `.yml`/`.yaml` configurations, linked state files, and SQLite sidecars outside the selected state boundary. It does not fall back to an ancestor or global QMD index. The local configuration may contain only the manifest's collection, with its exact vault path and inclusion mask. This matters because QMD's `update` command updates every collection in its selected index. Custom QMD `update` hooks are rejected: source-system updates need a separately authorized workflow. Existing custom indexes remain untouched on validation failure; inspect and separate their configuration before retrying.

`braingraph doctor` checks local state safety before probing QMD, then checks the collection/context contract, `qmd doctor`, and `qmd status`. If safety checks fail it stops QMD probes. If the index is missing, stale, unsupported, or unavailable, agents fall back to direct Markdown retrieval rather than treating the knowledge as lost.

### Retrieval with an explicit brain

Use the guarded commands when Braingraph is available:

```sh
braingraph qmd search /path/to/first-brain --text "approval policy"
braingraph qmd query /path/to/second-brain --text "why was this decision made" --limit 5
braingraph qmd get /path/to/second-brain --text qmd://second-brain/wiki/Decision.md
```

Search and hybrid query always supply the manifest's collection. `get` accepts only a `qmd://` URI from that collection, not a filesystem path, an unscoped document ID, or a URI carrying an index selector. These commands do not forward arbitrary QMD options. Retrieval can use QMD's derived caches but does not update source Markdown. Cross-brain retrieval is an explicit, separately scoped action, not an implicit expansion after a miss. Without Braingraph or QMD, read the selected brain's Markdown directly; do not silently use a global index.

### Refresh, scheduling, and recovery

Configuration and refresh acquire `.qmd/operation.lock` exclusively for the selected brain. Another brain remains independent. A concurrent mutation fails with a clear lock error; `--dry-run` prints the work without creating a lock or operation status. Every QMD child command has a bounded lifetime: probes use 30 seconds, and indexing/embedding use 600 seconds by default. `configure` and `refresh` accept `--timeout-seconds` from 1 to 3600 for each indexing or embedding command.

On timeout or normal interruption, Braingraph terminates the child process tree (a separate process group on macOS/Linux; `taskkill /T /F` on Windows), releases its lock, and records only operation name, timestamps, and success/failure in `.qmd/last-operation.json`. It does not write source content or queries into that status record. A failed refresh can be retried; the derived index is rebuildable. An abrupt process kill or power loss may leave a lock. Inspect the recorded PID and confirm no associated QMD process survives before manually removing that exact stale lock. Braingraph never guesses that a lock is stale merely because it is old, and never deletes a SQLite index as automatic recovery.

Scheduling is optional and opt-in. Use the user's scheduler with an absolute Braingraph executable/script path and an explicit workspace argument, for example `braingraph qmd refresh /path/to/first-brain --embed --timeout-seconds 600`. Create one independently named job per brain, preserve failure visibility, and avoid putting account credentials in scheduler arguments or logs. No scheduler is installed by `init`, `configure`, or `refresh`. A retrieval refresh does not authorize email ingestion, external writes, or business decisions.

When adopting an existing workspace, preserve the canonical Markdown and declared collection boundary,
then rebuild the target workspace's QMD index. Do not migrate, hash, or inspect SQLite internals merely
to retain derived state, and do not alter unrelated collections or shared caches. Validate the
collection path, inclusion mask, exclusions, purpose context, and a small representative retrieval
query after configuration.

After a consequential miss, alias failure, or taxonomy change, add a small fictional or sanitized retrieval fixture and use `qmd bench` to verify that the intended canonical page is discoverable. Do not create benchmark churn without evidence of a retrieval problem.

When using advanced upstream commands such as `qmd bench`, first select the exact brain directory, verify its local configuration, clear conflicting index overrides, and follow the installed version's skill. Do not use an upstream command's global fallback as a substitute for a missing local index.

## Canonical Boundary

Obsidian does not own the knowledge, and QMD search results are not evidence. Markdown and cited external sources remain authoritative. Both interfaces can be rebuilt from the workspace files and `braingraph.json`.
