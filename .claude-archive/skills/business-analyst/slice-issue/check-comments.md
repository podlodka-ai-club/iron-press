# Check Comments — Slices Parent Issue

This file is read and executed by the BA agent when `/ba-check-comments` routes to a Slices Parent issue.

## Inputs

- `issueId` — the Slices Parent issue ID (already loaded by router)

## Process

### Step 1 — Read Current State

1. Load the issue via `get_issue` to read the current description. Set status to **"Agent Working"** via `save_issue`.
2. Call `list_comments` on the issue.
3. List child issues (the slice issues) via `list_issues`.

### Step 2 — Analyze Comments

Read ALL comments. Identify which comments are **unhandled** — comments that do NOT have a "Resolved" threaded reply from the agent.

Comments may include:
- Answers to scoping or priority questions
- Requests to add, remove, merge, or reorder slices
- Clarifications about dependencies between slices
- Feedback on slice boundaries or grouping
- Any other feedback

### Step 3 — Apply Changes

Based on the comments, apply changes as needed:
- **Update existing slice issues** via `save_issue` (title, description, scope).
- **Create new slice issues** as children of the Slices Parent if new slices are needed.
- **Update the Slices Parent description** (slice table, phases) to reflect any changes.

### Step 4 — Mark Comments as Resolved

For each user comment that you handled, reply with "Resolved" as a threaded reply via `save_comment` using `parentId` set to that comment's ID. This marks which comments have been processed.

### Step 5 — Post Follow-Up Questions (if needed)

If the comments raise NEW questions you cannot answer, post a follow-up questions comment following the format in `.claude/skills/_shared/questions-format.md`.

### Step 6 — Set Final Status

Set the status on the Slices Parent issue:
- **If you posted NEW follow-up questions** → set status to **"Agent Blocked"** via `save_issue`.
- **If all questions are resolved and no new questions remain** → set status to **"Agent Working"** via `save_issue`.

### Step 7 — Report to User

Tell the user what changed (slices added/modified/removed, description updates) and whether any new questions were posted:
- **If you posted NEW follow-up questions** → show a link to the issue so the user can review and answer on Linear.
- **If all questions are resolved** → list the slice issue IDs so the user can dispatch `/ba <SLICE-ID>` for each (or `/tl-design <SLICE-0-ID>` for the architecture slice).
