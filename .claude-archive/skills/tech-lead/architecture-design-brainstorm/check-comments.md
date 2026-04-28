# Check Comments — Slice Architecture Brainstorm

This file is read and executed by the TL agent when `/tl-check-comments` routes to a Slice 0 issue (architecture brainstorm). It updates the brainstorm based on user answers and feedback — it does NOT finalize into a single architecture (that's a separate `/tl-design-finalize` step).

## Inputs

- `issueId` — the Slice issue ID (already loaded by router)

## Process

### Step 1 — Read Current State

1. Load the slice issue via `get_issue` to read the current description (Architecture Design — Brainstorm section with approaches, naming options, recommendation). Set status to **"Agent Working"** via `save_issue`.
2. Call `list_comments` on the issue.
3. Load the slice's parent (Slices Parent) and sibling slices for context if needed.

### Step 2 — Analyze Comments

Read ALL comments. Identify which comments are **unhandled** — comments that do NOT have a "Resolved" threaded reply from the agent.

Comments may include:
- Approach preferences or concerns (user leaning toward A or B, or suggesting a hybrid)
- Naming preferences
- Answers to data ownership, lifecycle, or scope questions
- Additional constraints or requirements that affect the design
- Requests to revise or reconsider parts of the design
- Any other feedback

### Step 3 — Update Architecture Brainstorm

Based on the user's answers, update the slice issue description via `save_issue`. Keep the `## Architecture Design — Brainstorm` format and incorporate the feedback:

- Revise approaches based on new constraints or requirements
- Update naming options based on user preferences
- Adjust trade-offs or recommendations based on answers
- Add notes to the Recommendation section reflecting user feedback
- If the user explicitly rules out one approach, remove it — brainstorming continues on the remaining approach (refining its details, naming, edge cases)
- Do NOT collapse into a finalized architecture — that's the `/tl-design-finalize` step

### Step 4 — Mark Comments as Resolved

For each user comment that you handled, reply with "Resolved" as a threaded reply via `save_comment` using `parentId` set to that comment's ID.

### Step 5 — Post Follow-Up Questions (if needed)

If the comments raise NEW questions or ambiguities you cannot resolve, post a follow-up questions comment following the format in `.claude/skills/_shared/questions-format.md`.

### Step 6 — Set Final Status

Set the status on the slice issue:
- **If you posted NEW follow-up questions** → set status to **"Agent Blocked"** via `save_issue`.
- **If all questions are resolved** → set status to **"Agent Blocked"** via `save_issue` (still blocked — awaiting `/tl-design-finalize` to produce the final architecture).

### Step 7 — Report to User

Tell the user what changed and whether any new questions remain:
- **If you posted NEW follow-up questions** → show a link to the issue so the user can review and answer on Linear, then run `/tl-check-comments <ISSUE-ID>` again.
- **If all questions are resolved** → mention they can run `/tl-design-finalize <ISSUE-ID>` to converge the brainstorm into a final architecture.
