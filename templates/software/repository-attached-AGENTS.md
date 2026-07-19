# {{REPOSITORY_NAME}} Attached Repository Hub

This directory is the canonical Braingraph governance hub for the attached Git repository `{{REPOSITORY_URL}}`. The checkout's machine-specific path is stored only in ignored local state.

## Layout

- This hub owns durable workspace guidance and links for the repository.
- The existing checkout retains its own Git layout and remains the source of truth for code and branch state.
- `{{INTEGRATION_BRANCH}}` is the configured integration branch.
- A generated checkout-root bridge, when enabled, is an ignored local adapter that points back to this hub. It is not canonical policy.

## Working Rules

- Read the attached checkout's repository-native instructions before changing code.
- Do not infer worktree-management support for an attached checkout.
- Keep live branch, commit, pull-request, review, and CI state in Git or its external owner.
- Promote only durable architecture and project understanding into the knowledge base.
- Never rewrite the checkout's Git layout, remove its bridge, or deregister it without explicit human authorization.
