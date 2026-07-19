# {{REPOSITORY_NAME}} Repository Hub

This directory is the local worktree hub for `{{REPOSITORY_URL}}`.

## Layout

- `.bare/` is the Git anchor. Never edit code there.
- `{{INTEGRATION_BRANCH}}/` is the stable integration worktree. Use it for orientation, not feature implementation.
- Other sibling directories are isolated feature or review worktrees.
- `.artifacts-shared/` stores ignored temporary engineering artifacts that should not become durable knowledge.

## Working Rules

- Read the selected worktree's repository-native `AGENTS.md` before changing code.
- Create a feature worktree for implementation. Read-only research does not require one.
- Use the same descriptive worktree name across repositories when work spans several repositories.
- Keep live branch, commit, pull-request, review, and CI state in Git or its external owner.
- Promote only durable architecture and project understanding into the knowledge base.
- Never force-push or delete a worktree or branch without explicit human authorization.

## Cleanup

Cleanup is never automatic. Inspect first. Removal requires the exact repository/worktree confirmation, a clean registered worktree, a recoverable branch state with no unpushed commits, an allowed reason, and explicit execution. The branch is preserved, so published but intentionally abandoned or squash-merged work remains recoverable. Branch deletion is always separate.
