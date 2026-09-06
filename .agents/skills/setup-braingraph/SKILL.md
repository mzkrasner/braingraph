---
name: setup-braingraph
description: Set up or extend a Braingraph agent-first Markdown knowledge workspace. Use when a user wants to create a second brain, adopt existing notes, register external systems, enable QMD, add a software repository, or establish guarded worktree practices.
---

# Set Up Braingraph

Build the smallest workspace that satisfies the human's current needs while preserving a path for later projects, domains, tools, and profiles.

## Workflow

1. Read the repository `README.md`, `docs/architecture.md`, and `docs/external-systems.md`.
2. Determine whether the user is creating a new workspace or adopting an existing directory. For an
   existing workspace, read `references/existing-workspace-adoption.md` before proposing changes.
3. Establish only the missing decisions:
   - workspace name and location;
   - other brains already present and which exact brain this setup may create or change (names alone are not identity);
   - a one-sentence durable purpose and intended scope: project, organization, professional domain, personal domain, or mixed;
   - the operational roots and representative directories where the human normally launches agents or performs work;
   - existing notes or sources to preserve;
   - baseline workspace sensitivity and any stricter source-specific boundaries;
   - permission to install or configure Obsidian and QMD;
   - external systems relevant now;
   - whether the software profile and Git repositories are relevant.
4. Before choosing the workspace location, read `references/workspace-topology.md`. Inventory the agreed operational roots, representative repository checkouts and worktrees, existing instruction files, and the discovery path each in-scope agent client will use. Do not infer the operational root from the setup repository, the current shell directory, or one convenient checkout.
5. For each external system, classify lifecycle status, ownership, role, stable record identity, freshness, read/write access, delegated write scope when applicable, capture mode, sensitivity, and unavailable-or-conflicting-evidence behavior. Read `references/system-assessment.md` when integrations are involved.
6. Agree on the ongoing maintenance boundary: `proposal-first` by default, or `delegated` with an explicit narrow scope for routine local Markdown updates. Persist that choice through `braingraph init`; external writes and taxonomy changes remain separately approval-gated.
7. Present a concise setup proposal. Include the proposed coordination root, knowledge root, repository modes, and a discovery matrix showing how agents launched from each representative working location will find the canonical workspace and relevant repository hub. Identify unresolved discovery gaps explicitly. Keep the control task under this repository's instruction scope until the target workspace's canonical instructions have been installed and verified. Do not install tools, create files, clone repositories, or mutate external systems before the user approves it.
8. Run every proposed mutating Braingraph command with `--dry-run` first.
9. Show the consequential dry-run actions and resolve conflicts without overwriting existing files.
10. Apply the approved commands: use `--execute` where the command requires it, and otherwise repeat without `--dry-run`.
11. Configure the QMD collection and workspace-purpose context unless the user explicitly declines installation; keep the generated Markdown operational either way.
12. Verify the generated cross-agent contract: each scoped `AGENTS.md` is canonical, each sibling `CLAUDE.md` contains only `@AGENTS.md`, and reusable project skills exist only under `.agents/skills`. Check the generated `braingraph-ingest`, `braingraph-query`, and `braingraph-maintain` skills can be read by each selected client, including the file-read fallback.
13. Validate discovery from every representative working location in the approved matrix. Use a fresh-agent or equivalent read-only check to prove that the exact `braingraph.json`, workspace `AGENTS.md`, `Start Here.md`, and relevant repository hub can be located without relying on prior chat context or an unrelated global instruction.
14. Offer a dry run of `braingraph obsidian open`, then open the generated `Start Here.md` only after approval.
15. Run `braingraph doctor <workspace>` and `braingraph knowledge lint <workspace>` and report capabilities that remain unconfigured, including instruction-adapter drift or duplicate vendor skill names. Treat doctor as setup-health validation, lint as deterministic note checks, and a fresh-agent exercise as a separate behavioral check. None proves the other layers passed. If authorized, complete the generated `Knowledge/evals/behavior/README.md` Obsidian editing/template/link round trip (substitute the configured knowledge directory); opening a URI alone is not success.
16. Give the user the generated `Start Here.md` path and explain how agents will propose or apply durable updates at meaningful milestones under the persisted maintenance boundary.
17. Review the completed setup for repeatable friction, unsupported assumptions, or behavior that did not generalize to the user's environment. When a likely Braingraph product gap remains after local diagnosis, read `references/product-feedback.md` and follow its duplicate-check, sanitization, approval, and issue-filing workflow.

## Constraints

- Do not assume the user already has Obsidian or QMD installed. They are Braingraph defaults; detect them and obtain approval before installation.
- Do not assume the user uses GitHub, Linear, Google Drive, or any other external system.
- Multiple brains on one machine are normal. Give each its own manifest, knowledge root, local QMD state, connector bindings, and maintenance boundary. Never create a global active-brain default or search, migrate, copy, or refresh neighboring brains implicitly.
- Before connector reads or synchronization, resolve the actual authenticated identity and match the declared account/tenant/principal. A stored binding or visible connector is not proof of current identity; unknown or mismatched identity blocks use and does not authorize trying another account.
- Do not enable the software profile merely because the setup repository is software.
- Do not place the workspace beside the user's actual work merely because that location is convenient. Either make the coordination root discoverable from normal launch locations or define explicit, non-duplicating adapters.
- Do not assume that registering or bridging one checkout covers sibling Git worktrees, other clones, or directories outside that checkout.
- Do not copy external content when linking or summarizing preserves the correct source of truth.
- Do not move or rewrite existing notes without a separate migration proposal and approval.
- Do not store credentials, tokens, raw connector payloads, or prohibited sensitive data in the workspace.
- Do not treat connector access as write authorization.
- Do not treat approval to configure a workspace as approval to create a GitHub issue. Present the sanitized issue draft and obtain explicit approval before filing it.
- Do not create speculative taxonomy. Start minimally and let evidence justify new boundaries.
- Do not treat setup completion as the end of knowledge maintenance. Fresh agents should proactively surface durable update candidates as work continues.
- Do not duplicate canonical instructions or skill bodies merely to populate a client-specific rules directory or slash-command menu. Read `docs/agent-compatibility.md` before adding an adapter.
- Do not compensate for a missing Braingraph capability with a custom migration program, workflow state
  machine, exhaustive evidence or hash ledger, repeated activation/restore protocol, or freeze of
  unrelated repositories. Escalate a demonstrated product gap instead. A narrowly scoped helper is
  appropriate only when the user approves it for concrete repetitive work.
- Do not move the setup task into an ungoverned scratch directory before the target workspace can
  independently surface its canonical instructions and setup context.

## Existing Workspaces

`braingraph init` is additive and refuses to overwrite files. Follow
`references/existing-workspace-adoption.md` when adopting an existing directory. Let the agent
interpret the existing knowledge and propose the smallest useful mapping; use Braingraph's shipped
commands for repeatable mutations and safety checks.

By default, use two approval boundaries: approve the adoption proposal, then approve execution after
reviewing the dry run. Preserve and map canonical knowledge, capture the preimage only for local files
that will actually change, rebuild disposable Obsidian/QMD state, and leave unrelated repositories and
external systems untouched. Additional gates or custom tooling require a specific observed risk, not
theoretical completeness.

Use `braingraph system update` for changed access, ownership, identity, or lifecycle rules. Mark retired systems `inactive` so provenance remains intelligible; do not silently delete their history.

## Software Profile

When the user enables software support, register each repository separately with its actual integration and optional production branch. Use `repo add --dry-run` when Braingraph should create and manage a new local anchor/worktree layout. Use `repo attach --dry-run` when an established checkout must retain its existing Git layout; explain that only the portable repository identity enters `braingraph.json`, while its absolute path enters ignored local state. Prefer the generated ignored discovery bridge when the checkout has no root instructions. That bridge covers only the exact attached checkout. If the repository has sibling worktrees or other clones, establish their discovery path separately through an applicable parent coordinator, tracked repository-native instructions, or explicit local adapters. If root `AGENTS.md` or `CLAUDE.md` already exists, use `--no-bridge` only after establishing how those repository-native instructions will point agents to the canonical workspace.

Validate every remote and integration/production branch before registration. Never persist credentials, query tokens, fragments, malformed refs, or an unverified remote branch. Use Braingraph worktree commands only for managed repositories; attached repositories retain their existing branch/worktree practices.

Never remove a worktree merely because work appears merged. Inspect it, report the exact candidate and risks, obtain explicit human confirmation, then use the exact confirmation token with `--execute`. Branch deletion is outside worktree removal.

Use `repo remove` only after the same explicit confirmation discipline. Deregistration preserves the hub, checkout, bridges, worktrees, and branches; report those retained recovery artifacts rather than deleting them implicitly.
