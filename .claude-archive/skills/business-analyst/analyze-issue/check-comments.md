# Check Comments — Agent Implementation Issue

This file is read and executed by the BA agent when `/ba-check-comments` routes to an Agent Implementation issue.

## Inputs

- `issueId` — the Agent Implementation issue ID (already loaded by router)

## Process

### Step 1 — Read Current State

1. Load the issue via `get_issue` to read the current description. Set status to **"Agent Working"** via `save_issue`.
2. Call `list_comments` on the issue.

### Step 2 — Analyze Comments

Read ALL comments. These may include:
- Answers to agent questions (matching question numbers or lettered options)
- Additional context or requirements from the user
- Change requests to existing sections
- Any other feedback

Identify which comments are **unhandled** — comments that do NOT have a "Resolved" threaded reply from the agent.

### Step 3 — Update Issue Description

Determine what needs to change in the issue description based on the comments. This could be:
- Answering open questions that refine acceptance criteria, business rules, edge cases, or scope
- Adding new user scenarios or business rules the user described in comments
- Adjusting the affected repositories
- Updating the feature flag decision
- Any other refinement based on user feedback

Update the issue via `save_issue` with the revised description.

### Step 4 — Mark Comments as Resolved

For each user comment that you handled, reply with "Resolved" as a threaded reply via `save_comment` using `parentId` set to that comment's ID. This marks which comments have been processed.

### Step 5 — Post Follow-Up Questions (if needed)

If the comments raise NEW questions you cannot answer, post a follow-up questions comment following the format in `.claude/skills/_shared/questions-format.md`.

### Step 6 — Set Final Status

Set the status on the Agent Implementation issue:
- **If you posted NEW follow-up questions** → set status to **"Agent Blocked"** via `save_issue`.
- **If all questions are resolved and no new questions remain** → set status to **"Agent Done"** via `save_issue`.

### Step 7 — Report to User

Tell the user what changed and whether any new questions were posted:
- **If you posted NEW follow-up questions** → show a link to the issue so the user can review and answer on Linear.
- **If all questions are resolved** → show `/tl <ISSUE-ID>` so the user can easily copy-paste the next command to hand off to the Tech Lead agent.
