# Workspace Topology Assessment

Use this assessment before choosing where to initialize Braingraph. A valid setup must work from the places where the human and their agents actually operate, not only from the directory in which setup happened.

## Terms

- **Operational root**: a directory tree from which the human routinely launches agents, opens projects, or starts work.
- **Coordination root**: the directory containing `braingraph.json`, the root `AGENTS.md`, repository hubs, and the knowledge directory.
- **Knowledge root**: the Obsidian-compatible Markdown directory inside the coordination root.
- **Checkout**: a Git working tree registered with Braingraph.
- **Sibling worktree**: another Git working tree sharing the same Git common directory. It is a separate instruction-discovery location even when it belongs to the same repository.
- **Discovery adapter**: a minimal pointer from a working location to canonical Braingraph instructions. It must not duplicate policy.

The coordination root may also be an operational root, but do not assume that relationship.

## Read-Only Assessment

Within the scope approved by the human:

1. Ask which agent clients are in scope, where the human normally starts them, and where they expect to start them later.
2. Inventory representative locations, including:
   - the normal project or domain root;
   - canonical repository checkouts;
   - sibling feature worktrees;
   - standalone working directories outside the proposed coordination root; and
   - existing parent and repository instruction files; and
   - safely readable user-level agent instructions that declare working-directory conventions or constraints.
3. For Git locations, use repository identity rather than directory names. Read-only commands such as these can distinguish clones and linked worktrees:

   ```bash
   git rev-parse --show-toplevel
   git rev-parse --git-common-dir
   git remote get-url origin
   git worktree list --porcelain
   ```

4. Determine how each supported client will discover the canonical instructions from each representative location. Account for both standing instructions and project skills.
5. Identify unrelated or differently sensitive directory trees. Do not place broad parent instructions above them merely to make discovery convenient.

Do not crawl unrelated home-directory content, move directories, or rewrite existing instructions during assessment.

## Discovery Rules

- Instructions at the coordination root govern only agents that can discover that root through ancestry or an explicit adapter.
- A `repo attach` bridge applies only to the exact checkout where it is created.
- Registering one checkout does not configure sibling worktrees, separate clones, or neighboring repositories.
- Tracked repository-native instructions can cover worktrees whose checked-out revisions contain an intentional pointer to Braingraph.
- A common parent coordinator can cover multiple repositories and sibling worktrees only when all relevant clients inherit its instructions and the parent scope does not improperly include unrelated work.
- Per-checkout or per-worktree adapters are machine-local fallbacks. Keep them minimal, ignored when appropriate, and verifiable.
- Global agent instructions may improve convenience, but setup must not depend on a personal global rule that another machine or teammate will not have.

## Required Proposal

Before mutation, show:

1. the proposed coordination and knowledge roots and why they fit the operational layout;
2. each repository's managed or attached mode;
3. any existing directories or instructions that will remain untouched;
4. any proposed adapter, including whether it is tracked, ignored, or generated; and
5. a discovery matrix with at least these columns:

| Representative working location | Kind | Canonical instructions reached through | Client coverage | Gap or action |
| --- | --- | --- | --- | --- |
| Normal project root | operational root | direct ancestry or adapter | named clients | none or proposed action |
| Repository checkout | checkout | repository or local bridge | named clients | none or proposed action |
| Feature worktree | sibling worktree | parent, tracked repository instructions, or local adapter | named clients | none or proposed action |

Use generic labels in durable or shared records. Keep absolute machine paths in ignored local state or the transient setup report.

Moving existing projects, changing the human's normal working root, or adding parent-level instructions over a broad directory is a separate consequential change and requires explicit approval.

## Acceptance Check

After setup, validate every representative row from that working directory with a fresh-agent or equivalent read-only check. The agent must be able to identify:

- the exact coordination root and `braingraph.json`;
- the canonical root `AGENTS.md`;
- the knowledge `Start Here.md`;
- the relevant repository hub when software work is involved; and
- the canonical project skill directory.

The result must not depend on prior conversation context, remembered absolute paths, or an unrelated global instruction.

Run `braingraph doctor` as a separate artifact check. Doctor verifies registered workspace and attachment state; it does not prove discovery from locations that Braingraph does not model.
