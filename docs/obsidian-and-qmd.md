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

`braingraph qmd configure` installs QMD's version-matched agent skill in the workspace, registers the collection, updates the index, and creates embeddings. `braingraph qmd refresh` updates the collection after later knowledge changes.

The QMD SQLite database and model cache remain in QMD's user-level cache. They are not stored in the vault or committed. If the index is missing, stale, or unavailable, agents fall back to direct Markdown retrieval rather than treating the knowledge as lost.

## Canonical Boundary

Obsidian does not own the knowledge, and QMD search results are not evidence. Markdown and cited external sources remain authoritative. Both interfaces can be rebuilt from the workspace files and `braingraph.json`.
