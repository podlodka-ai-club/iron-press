# Check Comments — Repo Issue

This file is read and executed by the TL agent when `/tl-check-comments` routes to a Repo Issue (child of an Agent Implementation issue).

## Inputs

- `issueId` — the Repo Issue ID (already loaded by router)
- The parent Agent Implementation issue ID is known from the sub-issue's `parentId`

## Process

### Step 1 — Read Current State

1. Load the sub-issue via `get_issue` to read the current description (Technical Implementation section).
2. Set status to **"Agent Working"** on the **parent** Agent Implementation issue (not the sub-issue) via `save_issue`.
3. Call `list_comments` on the sub-issue.

### Step 2 — Analyze Comments

Read ALL comments. Identify which comments are **unhandled** — comments that do NOT have a "Resolved" threaded reply from the agent.

Comments may include:
- Answers to technical questions about scope, ownership, or data relationships
- Corrections to the proposed technical approach
- Additional constraints or requirements
- Change requests to specific sections (database, API, components, etc.)
- Any other feedback

### Step 3 — Update Sub-Issue Description

Determine what needs to change in the sub-issue's Technical Implementation section based on the comments. This could be:
- Revising database schema (columns, types, indexes, constraints)
- Changing API endpoint design (routes, params, response shapes)
- Adjusting service object responsibilities or signatures
- Modifying component hierarchy or data flow
- Updating security considerations
- Any other technical refinement

Update the sub-issue via `save_issue` with the revised description.

### Step 4 — Mark Comments as Resolved

For each user comment that you handled, reply with "Resolved" as a threaded reply via `save_comment` using `parentId` set to that comment's ID. This marks which comments have been processed.

### Step 5 — Post Follow-Up Questions (if needed)

If the comments raise NEW questions you cannot answer, post a follow-up questions comment following the format in `.claude/skills/_shared/questions-format.md`.

### Step 6 — Set Final Status

Set the status on the **Agent Implementation parent issue** (NOT the sub-issue):
- **If you posted NEW follow-up questions** → set parent status to **"Agent Blocked"** via `save_issue`.
- **If all questions are resolved and no new questions remain** → set parent status to **"Agent Done"** via `save_issue`.

**IMPORTANT:** Only update the Agent Implementation parent issue status — NEVER change the status of sub-issues.

### Step 7 — Report to User

Tell the user what changed and whether any new questions were posted.
