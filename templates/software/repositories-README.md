# Repository Hubs

Each child directory represents one configured software repository. Its `.bare/` directory is the Git anchor, its stable integration worktree is for orientation, and sibling feature directories are isolated worktrees.

Use Braingraph's worktree commands. Never edit application code in `.bare/` or implement directly in a stable integration worktree.
