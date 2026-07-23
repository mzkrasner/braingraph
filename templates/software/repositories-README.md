# Repository Hubs

Each child directory is the durable governance hub for one configured software repository. Read its `AGENTS.md` to determine the integration mode.

- A **managed** hub contains a `.bare/` Git anchor, one stable integration worktree for orientation, and sibling isolated feature worktrees. Use Braingraph's worktree commands; never edit `.bare/` or implement in the stable worktree.
- An **attached** hub points to an established checkout whose absolute path is stored only in ignored local state. Braingraph does not rewrite that checkout's Git layout or provide managed worktree commands for it. A generated bridge covers only the attached checkout; sibling worktrees and other clones need a separately verified discovery route.

Hub governance files are portable. Git internals, child worktrees, attachment paths, and local discovery bridges are not.
