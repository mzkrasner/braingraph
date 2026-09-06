# Fictional Behavior Checks

These cases are operational test material, excluded from the normal knowledge index. They are not facts about this workspace or permission to inspect other real brains. All names, sources, identifiers, and events are fictional.

## Reproduce In Isolation

1. Create a new temporary parent directory. Run `braingraph init` in dry-run and then normal mode for two children named `cedar` and `maple`, using the names and descriptions in `fixtures.json`. Do not configure installed desktop tools or connectors unless the human separately approves that test.
2. Copy each fixture's `Knowledge/` contents into its corresponding temporary knowledge root. Leave the generated manifest, instructions, skills, and empty source ledger in place. Use the declared source notes as offline evidence only; example URLs must not be fetched.
3. Give a fresh agent one request from `cases.json`, the exact temporary Cedar root, and access only to the case's allowed resources. Tell it that external connectors are unavailable. Do not provide `rubric.md` or an expected answer to the evaluating agent.
4. Save its response, changed-file diff, tool access record, and any reported gaps outside both brains. For read-only cases compare before/after files to confirm no writes. A reviewer then scores the run against `rubric.md`.

Rerun focused cases after changing instructions, source routing, or retrieval. Record client/model/version, case ID, fixture revision, result, and remaining limitations. File-layout tests only verify fixture integrity; they do not measure whether an agent behaves correctly. A good semantic answer does not prove OS-level account or filesystem isolation either.

## Optional Obsidian Round Trip

This manual acceptance check requires explicit permission to open a temporary vault. Do not run it in a real brain.

1. Open temporary Cedar's knowledge directory as a vault. Confirm the title/root corresponds to Cedar, not Maple; a dispatched URI is not proof of registration.
2. Create a note from `_templates/Knowledge.md`. Replace date placeholders, edit `evidence_status` using Properties, and write a harmless fictional claim with a source link. For optional unknown verification dates, leave the property absent.
3. Create a second note linking to it. Rename the first note using Obsidian; follow the link and verify its saved Markdown target. If link updates are disabled, record that limitation rather than assuming a successful rename repaired links.
4. Close and reopen the note, inspect its on-disk Markdown, and run `braingraph knowledge lint <cedar-root>`. Confirm metadata is still parseable and that no independent policy appeared in `CLAUDE.md`.
5. If QMD testing was separately approved, configure and refresh only temporary Cedar. Search for the exact new note through `braingraph qmd search <cedar-root> --text "unique title"` and read the result. Confirm Maple's index/configuration and content were unchanged.

Keep this as a recorded acceptance result, not a claim inferred from JSON config existence. Optional app/plugin behavior varies by installed version; report untested portions honestly.
