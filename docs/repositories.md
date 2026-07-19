# Software Repositories

The software profile keeps durable repository governance separate from machine-local Git layouts. Every repository has a portable hub under `repositories/` and exactly one declared mode.

## Managed Repositories

Use `repo add` when Braingraph should create the local Git layout. It validates the remote syntax and declared branch refs before persisting configuration, then creates:

- `.bare/` as the Git anchor;
- a stable integration worktree for orientation;
- sibling isolated worktrees created through `worktree new`; and
- `.artifacts-shared/` for ignored temporary engineering artifacts.

The workspace `.gitignore` excludes every child directory below a repository hub, which keeps anchors and worktree contents out of an outer workspace repository. The hub's `AGENTS.md` and `CLAUDE.md` remain trackable.

```bash
braingraph repo add app \
  --workspace /path/to/workspace \
  --url git@github.com:organization/app.git \
  --integration-branch dev \
  --production-branch main \
  --dry-run
```

Dry runs still perform read-only remote/ref validation. A registration is not persisted when validation or cloning fails, and a newly created partial hub is rolled back.

## Attached Repositories

Use `repo attach` when a checkout already exists and must retain its current `.git` layout. The shared manifest stores the repository URL, hub, mode, and branch contract. Ignored `braingraph.local.json` stores only the current machine's absolute checkout path and bridge choice.

```bash
braingraph repo attach app \
  --workspace /path/to/workspace \
  --checkout /path/to/existing/app \
  --integration-branch dev \
  --production-branch main \
  --dry-run
```

By default, attachment creates ignored checkout-root `AGENTS.md` and `CLAUDE.md` discovery bridges and records them in Git's local exclude file. The bridge points to the canonical workspace and repository hub; it does not duplicate policy. If either filename already contains repository-native instructions, attachment refuses to overwrite it. Review those instructions and use `--no-bridge` only when their existing discovery path is intentional.

Managed worktree commands reject attached repositories because Braingraph does not own their layout.

Worktree removal distinguishes inspection from execution. Inspection and dry-run remain available when process ownership cannot be determined, but `--execute` fails closed unless Braingraph can positively verify that no process has a working directory inside the target. The current implementation uses `lsof` on macOS and Linux. Windows does not expose an equivalent built-in inspection contract, so destructive worktree removal is intentionally unavailable there; inspect the worktree and perform any separately authorized Git cleanup with an appropriate Windows-native process tool.

## Validation And Recovery

Repository URLs may use explicit HTTPS, HTTP, SSH, Git, file, SCP-style, or local-path forms. Embedded HTTP credentials, query strings, fragments, control characters, Markdown backticks, unsupported protocols, invalid branch names, and absent remote branches are rejected before persistence.

`repo remove` requires an exact repository confirmation and exactly one of `--dry-run` or `--execute`. It removes shared registration and machine-local attachment mapping but deliberately preserves hubs, checkouts, bridges, worktrees, and branches. Review and remove those retained artifacts separately only when the human explicitly requests it.

Run `braingraph doctor` after registration, attachment, moving a checkout, or changing local instructions. Doctor validates hub types and containment, managed anchors/worktrees, attached Git roots and origins, local mappings, and expected bridge files without mutating state.
