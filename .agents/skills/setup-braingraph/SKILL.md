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
   - intended scope: project, organization, professional domain, personal domain, or mixed;
   - existing notes or sources to preserve;
   - privacy and sensitivity boundaries;
   - permission to install or configure Obsidian and QMD;
   - external systems relevant now;
   - whether the software profile and Git repositories are relevant.
4. For each external system, classify ownership, role, identity, freshness, read/write access, capture mode, sensitivity, and unavailable-connector behavior. Read `references/system-assessment.md` when integrations are involved.
5. Present a concise setup proposal. Do not install tools, create files, clone repositories, or mutate external systems before the user approves it.
6. Run every proposed mutating Braingraph command with `--dry-run` first.
7. Show the consequential dry-run actions and resolve conflicts without overwriting existing files.
8. Apply the approved commands without `--dry-run`.
9. Configure the QMD collection unless the user explicitly declines installation; keep the generated Markdown operational either way.
10. Offer a dry run of `braingraph obsidian open`, then open the generated `Start Here.md` only after approval.
11. Run `braingraph doctor <workspace>` and report capabilities that remain unconfigured.
12. Give the user the generated `Start Here.md` path and a concise explanation of the ongoing human-agent loop.

## Constraints

- Do not assume the user already has Obsidian or QMD installed. They are Braingraph defaults; detect them and obtain approval before installation.
- Do not assume the user uses GitHub, Linear, Google Drive, or any other external system.
- Do not enable the software profile merely because the setup repository is software.
- Do not copy external content when linking or summarizing preserves the correct source of truth.
- Do not move or rewrite existing notes without a separate migration proposal and approval.
- Do not store credentials, tokens, raw connector payloads, or prohibited sensitive data in the workspace.
- Do not treat connector access as write authorization.
- Do not create speculative taxonomy. Start minimally and let evidence justify new boundaries.

## Existing Workspaces

`braingraph init` is additive and refuses to overwrite files. When adopting an existing directory:

1. inventory the current structure;
2. identify existing canonical notes and instructions;
3. propose mappings into Braingraph roles;
4. initialize only after the mapping is approved; and
5. leave migration as a separate, reviewable step.

## Software Profile

When the user enables software support, register each repository separately with its actual integration and production branches. Use `repo add --dry-run` before cloning. Use Braingraph worktree commands for isolated work and inspection-first cleanup.

Never remove a worktree merely because work appears merged. Inspect it, report the exact candidate and risks, obtain explicit human confirmation, then use the exact confirmation token with `--execute`. Branch deletion is outside worktree removal.
