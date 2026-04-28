#!/usr/bin/env bash
#
# remove-worktree.sh — Remove a git worktree while keeping the branch.
#
# Usage:
#   remove-worktree.sh \
#     --repo-path /absolute/path/to/repo \
#     --worktree-dir mcm--eng-850-feature
#
# Arguments:
#   --repo-path      Absolute path to the main repo checkout
#   --worktree-dir   Name of the worktree directory inside .worktrees/

set -euo pipefail

# --- Parse arguments ---
REPO_PATH=""
WORKTREE_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-path)    REPO_PATH="$2";    shift 2 ;;
    --worktree-dir) WORKTREE_DIR="$2"; shift 2 ;;
    *) echo "ERROR: Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$REPO_PATH" || -z "$WORKTREE_DIR" ]]; then
  echo "ERROR: --repo-path and --worktree-dir are required" >&2
  exit 1
fi

WORKTREE_PATH="$REPO_PATH/.worktrees/$WORKTREE_DIR"

if [[ ! -d "$WORKTREE_PATH" ]]; then
  echo "SKIP: Worktree does not exist: $WORKTREE_PATH"
  exit 0
fi

cd "$REPO_PATH"
git worktree remove ".worktrees/$WORKTREE_DIR"

echo "REMOVED: $WORKTREE_PATH"
