#!/usr/bin/env bash
#
# copy-secrets.sh — Copy gitignored credential keys into a worktree.
#
# Worktrees don't include gitignored files. Rails repos need credential
# .key files to boot and run tests. This script copies them from the
# main repo checkout into the worktree.
#
# Usage:
#   copy-secrets.sh --repo-path /absolute/path/to/repo --worktree-path /absolute/path/to/worktree
#
# Exit codes:
#   0  success (even if no keys found)
#   1  argument error

set -euo pipefail

# ── Parse arguments ──────────────────────────────────────────────

REPO_PATH=""
WORKTREE_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-path)     REPO_PATH="$2";     shift 2 ;;
    --worktree-path) WORKTREE_PATH="$2"; shift 2 ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$REPO_PATH" || -z "$WORKTREE_PATH" ]]; then
  echo "ERROR: --repo-path and --worktree-path are required." >&2
  exit 1
fi

# ── Copy credential keys ────────────────────────────────────────

CREDS_SRC="$REPO_PATH/config/credentials"
CREDS_DST="$WORKTREE_PATH/config/credentials"

if [[ ! -d "$CREDS_SRC" ]]; then
  echo "No credentials directory at $CREDS_SRC — nothing to copy."
  exit 0
fi

mkdir -p "$CREDS_DST"

copied=0
for keyfile in "$CREDS_SRC"/*.key; do
  [[ -f "$keyfile" ]] || continue
  cp "$keyfile" "$CREDS_DST/"
  copied=$((copied + 1))
done

if [[ $copied -eq 0 ]]; then
  echo "No .key files found in $CREDS_SRC."
else
  echo "Copied $copied credential key(s) to $CREDS_DST."
fi
