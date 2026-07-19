---
name: setup-braingraph
description: Set up or extend a Braingraph agent-first Markdown knowledge workspace. Use when a user wants to create a second brain, adopt existing notes, register external systems, enable QMD, add a software repository, or establish guarded worktree practices.
---

# Set Up Braingraph

Build the smallest workspace that satisfies the human's current needs while preserving a path for later projects, domains, tools, and profiles.

## Workflow

1. Read the repository `README.md`, `docs/architecture.md`, and `docs/external-systems.md`.
2. Determine whether the user is creating a new workspace or adopting an existing directory.
3. Establish only the missing decisions:
   - workspace name and location;
   - a one-sentence durable purpose and intended scope: project, organization, professional domain, personal domain, or mixed;
   - existing notes or sources to preserve;
   - baseline workspace sensitivity and any stricter source-specific boundaries;
   - permission to install or configure Obsidian and QMD;
   - external systems relevant now;
   - whether the software profile and Git repositories are relevant.
4. For each external system, classify lifecycle status, ownership, role, stable record identity, freshness, read/write access, delegated write scope when applicable, capture mode, sensitivity, and unavailable-or-conflicting-evidence behavior. Read `references/system-assessment.md` when integrations are involved.
5. Agree on the ongoing maintenance boundary: `proposal-first` by default, or `delegated` with an explicit narrow scope for routine local Markdown updates. Persist that choice through `braingraph init`; external writes and taxonomy changes remain separately approval-gated.
6. Present a concise setup proposal. Do not install tools, create files, clone repositories, or mutate external systems before the user approves it.
7. Run every proposed mutating Braingraph command with `--dry-run` first.
8. Show the consequential dry-run actions and resolve conflicts without overwriting existing files.
9. Apply the approved commands: use `--execute` where the command requires it, and otherwise repeat without `--dry-run`.
10. Configure the QMD collection and workspace-purpose context unless the user explicitly declines installation; keep the generated Markdown operational either way.
11. Verify the generated cross-agent contract: each scoped `AGENTS.md` is canonical, each sibling `CLAUDE.md` contains only `@AGENTS.md`, and reusable project skills exist only under `.agents/skills`.
12. Offer a dry run of `braingraph obsidian open`, then open the generated `Start Here.md` only after approval.
13. Run `braingraph doctor <workspace>` and report capabilities that remain unconfigured, including instruction-adapter drift or duplicate vendor skill names.
14. Give the user the generated `Start Here.md` path and explain how agents will propose or apply durable updates at meaningful milestones under the persisted maintenance boundary.
15. Review the completed setup for repeatable friction, unsupported assumptions, or behavior that did not generalize to the user's environment. When a likely Braingraph product gap remains after local diagnosis, read `references/product-feedback.md` and follow its duplicate-check, sanitization, approval, and issue-filing workflow.

## Constraints

- Do not assume the user already has Obsidian or QMD installed. They are Braingraph defaults; detect them and obtain approval before installation.
- Do not assume the user uses GitHub, Linear, Google Drive, or any other external system.
- Do not enable the software profile merely because the setup repository is software.
- Do not copy external content when linking or summarizing preserves the correct source of truth.
- Do not move or rewrite existing notes without a separate migration proposal and approval.
- Do not store credentials, tokens, raw connector payloads, or prohibited sensitive data in the workspace.
- Do not treat connector access as write authorization.
- Do not treat approval to configure a workspace as approval to create a GitHub issue. Present the sanitized issue draft and obtain explicit approval before filing it.
- Do not create speculative taxonomy. Start minimally and let evidence justify new boundaries.
- Do not treat setup completion as the end of knowledge maintenance. Fresh agents should proactively surface durable update candidates as work continues.
- Do not duplicate canonical instructions or skill bodies merely to populate a client-specific rules directory or slash-command menu. Read `docs/agent-compatibility.md` before adding an adapter.

## Existing Workspaces

`braingraph init` is additive and refuses to overwrite files. When adopting an existing directory:

1. inventory the current structure;
2. identify existing canonical notes and instructions;
3. propose mappings into Braingraph roles;
4. initialize only after the mapping is approved; and
5. leave migration as a separate, reviewable step.

Use `braingraph system update` for changed access, ownership, identity, or lifecycle rules. Mark retired systems `inactive` so provenance remains intelligible; do not silently delete their history.

## Software Profile

When the user enables software support, register each repository separately with its actual integration and production branches. Use `repo add --dry-run` before cloning. Use Braingraph worktree commands for isolated work and inspection-first cleanup.

Never remove a worktree merely because work appears merged. Inspect it, report the exact candidate and risks, obtain explicit human confirmation, then use the exact confirmation token with `--execute`. Branch deletion is outside worktree removal.
