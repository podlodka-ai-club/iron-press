---
name: check-comments
description: "Check comments on a BA-owned Linear issue and update it based on answers and feedback. Routes to the correct check-comments handler based on issue type."
---

## Process

### Step 1 — Parse Input

Extract the issue identifier from the user's input. This can be:
- An issue ID (e.g., `ENG-123`)
- A Linear issue URL (e.g., `https://linear.app/team/issue/ENG-123/...`)

If no issue is provided, ask the user for one and wait.

### Step 2 — Load and Classify Issue

Load the issue via `get_issue` and classify the issue by its title:

| Title Pattern | Handler File |
|---------------|-------------|
| Ends with `- Agent Implementation` | `.claude/skills/business-analyst/analyze-issue/check-comments.md` |
| Ends with `- Slices` | `.claude/skills/business-analyst/slice-issue/check-comments.md` |

If the issue title matches neither pattern, report an error: "This issue is not a BA-owned issue (expected title ending with '- Agent Implementation' or '- Slices'). Check the issue ID and try again." Stop.

### Step 3 — Execute Handler

Read the handler file identified in Step 2 using the Read tool. Follow its instructions exactly.
