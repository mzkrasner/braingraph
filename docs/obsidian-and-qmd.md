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

Braingraph runs every QMD operation from the workspace root. QMD stores that workspace's configuration and SQLite index under ignored `.qmd/`, outside the Markdown vault; shared downloaded model caches may remain in QMD's user cache. Configuration and refresh do not enumerate, update, or delete unrelated workspace collections. `braingraph doctor` checks the local configuration, collection/context contract, `qmd doctor`, and `qmd status`. If the index is missing, stale, unsupported, or unavailable, agents fall back to direct Markdown retrieval rather than treating the knowledge as lost.

After a consequential miss, alias failure, or taxonomy change, add a small fictional or sanitized retrieval fixture and use `qmd bench` to verify that the intended canonical page is discoverable. Do not create benchmark churn without evidence of a retrieval problem.

## Canonical Boundary

Obsidian does not own the knowledge, and QMD search results are not evidence. Markdown and cited external sources remain authoritative. Both interfaces can be rebuilt from the workspace files and `braingraph.json`.
