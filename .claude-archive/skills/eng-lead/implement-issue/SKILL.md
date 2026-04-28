---
name: implement-issue
description: "Orchestrate implementation of a Linear Agent Implementation issue. Spawns eng-lead agent for preparation (branches/worktrees), then dispatches implementation agents per repo issue."
---

## Step 0 — Parse Input

1. Split the arguments string. Extract `<ID>` (required) — the first non-flag argument.
2. If `<ID>` is missing, report error: "Usage: /code <ISSUE-ID>" and stop.
3. Determine the ID type:
   - **Issue identifier**: matches pattern like `ENG-123` (letters, dash, digits)
   - **Linear issue URL**: contains `linear.app/` and `/issue/` — extract the issue identifier (e.g., `ENG-534` from `https://linear.app/team/issue/ENG-534/...`)
   - Otherwise: report error ("Invalid input. Provide an Agent Implementation issue ID like ENG-123 or a Linear issue URL.") and stop.

## Step 1 — Spawn Eng-Lead for Preparation

Spawn the `eng-lead` agent to prepare branches and worktrees:

- **`subagent_type`**: `eng-lead`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Prepare worktrees for <ID>`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/eng-lead/implement-issue/prepare-branches.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the eng-lead agent to complete.

**If the eng-lead agent reports ANY error or its output does NOT contain `WORK_UNITS_START`**: Report the exact error to the user and **STOP IMMEDIATELY**. Do NOT attempt to create branches, worktrees, or implement code yourself. Do NOT try an alternative approach. Just report the error and end.

## Step 2 — Parse Work Units

Parse the eng-lead agent's output. Extract:

1. **Agent Implementation Issue**: ID and title
2. **Base branch**: the base branch used
3. **Work units**: Parse the `WORK_UNITS_START` ... `WORK_UNITS_END` block. Each work unit is separated by `---` and contains key-value pairs:
   - `issueId`, `issueName`, `label`, `repoPath`, `baseBranch`, `branchName`, `worktreeDir`, `worktreePath`, `agentType`, `parentIssueId`

If no work units were returned, report and stop.

Also note any skipped issues from the Skipped Issues table.

## Step 3 — Dispatch Implementation Agents

For each work unit, dispatch an agent using the `Agent` tool:

- **`subagent_type`**: the `agentType` from the work unit (`rails-backend-dev` or `react-frontend-dev`)
- **`run_in_background`**: `true` (enables parallel execution)
- **`description`**: `Implement <label> for <Agent Implementation Issue title>`
- **`mode`**: `bypassPermissions`

**Agent prompt** (adapt per work unit):

```
You are implementing code for Linear issue: <issueId>

## CRITICAL: Working Directory and Branch

Your working directory is: <worktreePath>
Your git branch is: <branchName>
Your target repo is: <repoPath>
Your PR base branch is: <baseBranch>

ALL file operations (Read, Write, Edit, Glob, Grep) and ALL bash commands MUST use this directory as the base.

Before doing anything else, run these verification checks and STOP if any fail:
1. Verify the directory exists: `ls <worktreePath>`
2. Verify you are on the correct branch: `cd <worktreePath> && git branch --show-current`
   — The output MUST be exactly: <branchName>
3. Verify you are in the correct repo: `cd <worktreePath> && git remote get-url origin`
   — The output MUST contain the expected repo name

If any check fails, report the mismatch and STOP.

## Your Responsibility

You are implementing the **<label>** portion of this feature in the `<repo directory name>` repository.

## Linear Issue

Load your implementation spec from Linear issue `<issueId>` via `get_issue`. Read the full description — this contains your requirements.
- If the issue has a Technical Implementation section, follow it precisely.
- If not, implement based on the Context, Goal, and requirements in the description, focusing on changes relevant to your repository (<label>).

## Linear Status

Before starting implementation, set the issue status:
- Call `save_issue(<issueId>)` to set status to `In Development`.

## Instructions

1. Read the project's CLAUDE.md (or AGENTS.md) and your agent knowledge file first.
2. Load and read your implementation spec from Linear (see above).
3. Implement ALL changes described in the spec that are relevant to your repository (<label>).
4. Follow existing codebase patterns exactly.
5. Run all verification checks as described in your agent instructions:
   - For rails-backend-dev: `cd <worktreePath> && bundle exec rspec` and `cd <worktreePath> && bundle exec rubocop -A`
   - For react-frontend-dev: `cd <worktreePath> && pnpm typecheck` and `cd <worktreePath> && pnpm build`
6. After implementation is complete and checks pass:
   a. Stage all changed files: `cd <worktreePath> && git add <specific files>`
   b. Commit with a descriptive message referencing the Linear issue
   c. Push the branch: `cd <worktreePath> && git push -u origin <branchName>`
   d. Create a PR targeting the base branch: `cd <worktreePath> && gh pr create --base <baseBranch> --title "<issueId>: <issueName>" --body "<PR body with Linear issue reference>"`
7. Report back the PR URL when done.
```

Dispatch all work units in parallel (multiple Agent tool calls in one message, each with `run_in_background: true`).

## Step 6 — Clean Up Worktrees

After all agents complete, remove the worktrees while keeping the branches.

For each work unit:
```bash
.claude/skills/eng-lead/implement-issue/scripts/remove-worktree.sh \
  --repo-path <repoPath> \
  --worktree-dir <worktreeDir>
```

## Step 7 — Output Summary

```
## Code Implementation Results — <Agent Implementation title> — <timestamp>

| Issue | Label | Repo | Agent | Branch | PR | Status |
|-------|-------|------|-------|--------|----|--------|
| ENG-615 | Backend | backend-app/ | rails-backend-dev | mcmbrest/eng-615-... | <PR URL> | Done |
| ENG-617 | Frontend | frontend-app/ | react-frontend-dev | mcmbrest/eng-617-... | <PR URL> | Done |

```

Only if there are skipped issues, add:

```
### Skipped Issues
| Issue | Status | Reason |
|-------|--------|--------|
| ENG-618 | In Progress | Not in Todo status |
```

If any agent failed, include the error in the Status column.
