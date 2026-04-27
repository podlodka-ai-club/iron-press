#!/usr/bin/env bash
#
# create-worktree.sh — Create a git worktree for one work unit.
#
# Handles:
#   1. Fetching latest from origin
#   2. Ensuring custom base branch exists on origin (creates from main if missing)
#   3. Creating the worktree with a new branch off the base
#   4. Verifying branch and remote
#
# Usage:
#   create-worktree.sh \
#     --repo-path /absolute/path/to/repo \
#     --branch-name mcm/eng-850-feature \
#     --base-branch main
#
# Exit codes:
#   0  success
#   1  argument error
#   2  git operation failed
#   3  verification failed

set -euo pipefail

# ── Parse arguments ──────────────────────────────────────────────

REPO_PATH=""
BRANCH_NAME=""
BASE_BRANCH="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-path)   REPO_PATH="$2";   shift 2 ;;
    --branch-name) BRANCH_NAME="$2"; shift 2 ;;
    --base-branch) BASE_BRANCH="$2"; shift 2 ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$REPO_PATH" || -z "$BRANCH_NAME" ]]; then
  echo "ERROR: --repo-path and --branch-name are required." >&2
  exit 1
fi

if [[ ! -d "$REPO_PATH/.git" && ! -f "$REPO_PATH/.git" ]]; then
  echo "ERROR: $REPO_PATH is not a git repository." >&2
  exit 1
fi

# ── Derived values ───────────────────────────────────────────────

WORKTREE_DIR="${BRANCH_NAME//\//-}"
WORKTREE_PATH="$REPO_PATH/.worktrees/$WORKTREE_DIR"

echo "repo:     $REPO_PATH"
echo "branch:   $BRANCH_NAME"
echo "base:     $BASE_BRANCH"
echo "worktree: $WORKTREE_PATH"
echo ""

# ── Step 1: Fetch origin ────────────────────────────────────────

echo "Fetching origin..."
git -C "$REPO_PATH" fetch origin
echo ""

# ── Step 2: Ensure base branch exists on origin ─────────────────

if [[ "$BASE_BRANCH" != "main" ]]; then
  echo "Checking if base branch '$BASE_BRANCH' exists on origin..."
  if git -C "$REPO_PATH" ls-remote --heads origin "$BASE_BRANCH" | grep -q "$BASE_BRANCH"; then
    echo "Base branch '$BASE_BRANCH' exists on origin."
  else
    echo "Base branch '$BASE_BRANCH' not found on origin. Creating from main..."
    git -C "$REPO_PATH" branch "$BASE_BRANCH" origin/main
    git -C "$REPO_PATH" push -u origin "$BASE_BRANCH"
    echo "Base branch '$BASE_BRANCH' created and pushed."
  fi
  echo ""
fi

# ── Step 3: Create worktree ─────────────────────────────────────

mkdir -p "$REPO_PATH/.worktrees"

if [[ -d "$WORKTREE_PATH" ]]; then
  echo "Worktree path already exists at $WORKTREE_PATH — reusing."
else
  # Try creating with a new branch; fall back if branch already exists
  if git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "origin/$BASE_BRANCH" 2>/dev/null; then
    echo "Worktree created with new branch '$BRANCH_NAME'."
  elif git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" "$BRANCH_NAME" 2>/dev/null; then
    echo "Branch '$BRANCH_NAME' already existed — worktree created on existing branch."
  else
    echo "ERROR: Failed to create worktree." >&2
    exit 2
  fi
fi
echo ""

# ── Step 4: Verify branch ───────────────────────────────────────

ACTUAL_BRANCH="$(git -C "$WORKTREE_PATH" branch --show-current)"
if [[ "$ACTUAL_BRANCH" != "$BRANCH_NAME" ]]; then
  echo "ERROR: Branch mismatch. Expected '$BRANCH_NAME', got '$ACTUAL_BRANCH'." >&2
  exit 3
fi
echo "Branch verified: $ACTUAL_BRANCH"

# ── Step 5: Verify remote ───────────────────────────────────────

REMOTE_URL="$(git -C "$WORKTREE_PATH" remote get-url origin)"
echo "Remote verified: $REMOTE_URL"
echo ""

# ── Done ─────────────────────────────────────────────────────────

echo "WORKTREE_PATH=$WORKTREE_PATH"
echo "WORKTREE_DIR=$WORKTREE_DIR"
echo "Done."
