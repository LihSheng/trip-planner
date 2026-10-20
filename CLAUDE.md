# CLAUDE.md

Domain terms live in `CONTEXT.md`.

## Branches and PRs

- Cut each branch from a fresh `origin/main`: `git fetch origin && git switch -c <branch> origin/main`.
- Stack a PR on another PR only when it needs that PR's unmerged code. Name the base PR in the PR body.

## New worktrees

- A new worktree has no `node_modules`. Start `npm ci --no-audit --no-fund` in the background as your first step, then read code while it installs. Run `npm run typecheck` and `npm test` after it finishes.
