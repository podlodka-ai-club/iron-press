---
name: code-prepare
description: "Prepare git branches and worktrees for implementing a Linear Agent Implementation issue. Creates worktrees for each repo issue created by the Tech Lead."
---

## Step 0 — Parse Input

1. Split the arguments string. Extract `<ID>` (required) — the first non-flag argument.
2. If `<ID>` is missing, report error: "Usage: code-prepare <ISSUE-ID>" and stop.
3. Determine the ID type:
   - **Issue identifier**: matches pattern like `ENG-123` (letters, dash, digits)
   - **Linear issue URL**: contains `linear.app/` and `/issue/` — extract the issue identifier
   - Otherwise: report error ("Invalid input.") and stop.

## Step 1 — Resolve Agent Implementation Issue

1. Call `get_issue(<ID>)` to load the issue with full details.
2. **Validate title**: If the title does NOT end with `Agent Implementation`, report error ("Issue <ID> is not an Agent Implementation issue.") and stop.
3. Load all child sub-issues via `list_issues` (filter by parent, `includeArchived: false`).
4. If no children exist, report error ("Issue <ID> has no repo issues. Run `/tl <ID>` first to create them.") and stop.

## Step 2 — Map Sub-Issues to Repos

The Agent Implementation has repo issues created by the Tech Lead. Each sub-issue becomes its own work unit.

1. Determine the **workspace root** by running `pwd`.

2. For each child sub-issue, determine its target repo by parsing the title suffix:

   | Title suffix | Label | Repo directory                      | Agent type |
   |--------------|---|-------------------------------------|---|
   | `- Backend`  | Backend | `<workspaceRoot>/backend-app`       | `rails-backend-dev` |
   | `- Frontend` | Frontend | `<workspaceRoot>/frontend-app`      | `react-frontend-dev` |

3. **Filtering**: Only process sub-issues in `Todo` status. Skip all others (log them).

4. **Branch name**: Get the GitHub username via `git config user.username`. For each sub-issue, get `branchName` from `get_issue`. The final branch is `<githubUsername>/<linearBranchName>`. Fallback: `<githubUsername>/<issue-identifier-lowercased>`.

5. **Base branch**: Read the first sub-issue's description. Find `Base branch:` in the Repository section. If not found, default to `main`. If the value is NOT `main` (e.g., a slice branch like `eng-803-reports-slices`), prepend the GitHub username: `<githubUsername>/<baseBranch>`.

6. **Worktree directory**: Replace all `/` with `--` in the branch name.

7. Each work unit has:
   - `issueId`: the sub-issue's Linear ID
   - `issueName`: the sub-issue's Linear name
   - `label`: Backend, Frontend
   - `repoPath`: absolute path to the repo
   - `baseBranch`: base branch name
   - `branchName`: full git branch name
   - `worktreeDir`: sanitized directory name
   - `agentType`: `rails-backend-dev` or `react-frontend-dev`
   - `parentIssueId`: the Agent Implementation issue ID

8. If no sub-issues remain after filtering, report ("No sub-issues in Todo status.") and stop.

## Step 3 — Create Worktrees

For each work unit, run the `create-worktree.sh` script. The script handles fetching, ensuring the base branch exists on origin (creating from `main` if missing), creating the worktree, and verifying branch/remote.

```bash
.claude/skills/eng-lead/implement-issue/scripts/create-worktree.sh \
  --repo-path <repoPath> \
  --branch-name <branchName> \
  --base-branch <baseBranch>
```

The script outputs `WORKTREE_PATH=<path>` and `WORKTREE_DIR=<dir>` on success. Non-zero exit means failure — stop and report the error.

After the worktree is created, for **Rails repos only** (`rails-backend-dev` agent type), copy gitignored credential keys:

```bash
.claude/skills/eng-lead/implement-issue/scripts/copy-secrets.sh \
  --repo-path <repoPath> \
  --worktree-path <worktreePath>
```

Process one work unit at a time. Complete both scripts for one work unit before moving to the next.

## Step 4 — Output Work Units

Output the results in this exact format. The orchestrator (code command) will parse this output.

```
## Code Prepare Complete

**Agent Implementation Issue**: <ID> - <title>

### Work Units

WORK_UNITS_START
issueId: <id>
issueName: <name>
label: <label>
repoPath: <absolute repo path>
baseBranch: <base branch>
branchName: <full branch name>
worktreeDir: <sanitized directory name>
worktreePath: <absolute worktree path>
agentType: <rails-backend-dev | react-frontend-dev>
parentIssueId: <Agent Implementation issue id>
---
(next work unit, separated by ---)
WORK_UNITS_END

### Skipped Issues
| Issue | Status | Reason |
|-------|--------|--------|
| ... | ... | ... |
```
