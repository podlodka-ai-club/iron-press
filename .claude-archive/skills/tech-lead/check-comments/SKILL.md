---
name: check-comments
description: "Check comments on a TL-owned Linear issue and update it based on answers and feedback. Routes to the correct check-comments handler based on issue type."
---

## Process

### Step 1 — Parse Input

Extract the issue identifier from the user's input. This can be:
- An issue ID (e.g., `ENG-123`)
- A Linear issue URL (e.g., `https://linear.app/team/issue/ENG-123/...`)

If no issue is provided, ask the user for one and wait.

### Step 2 — Load and Classify Issue

Load the issue via `get_issue` and classify the issue by examining its title and parent:

| Classification | Condition | Handler File |
|---------------|-----------|-------------|
| **Repo Issue** | Issue is a child of an Agent Implementation issue (parent title ends with `- Agent Implementation`) | `.claude/skills/tech-lead/prepare-issue/check-comments.md` |
| **Slice (brainstorm design)** | Title starts with `Slice 0` AND title ends with `- Brainstorm` | `.claude/skills/tech-lead/architecture-design-brainstorm/check-comments.md` |
| **Slice (direct design)** | Title starts with `Slice 0` AND title does NOT end with `- Brainstorm` | `.claude/skills/tech-lead/architecture-design/check-comments.md` |

For Repo Issues: load the parent issue via `get_issue` using the issue's `parentId` to verify the parent title ends with `- Agent Implementation`.

For Slice 0 issues: check the **title suffix** to determine which design flow was used (`- Brainstorm` → brainstorm handler, anything else → direct handler).

If the issue matches neither pattern, report an error: "This issue is not a TL-owned issue (expected a Slice issue or a child of an Agent Implementation issue). Check the issue ID and try again." Stop.

### Step 3 — Execute Handler

Read the handler file identified in Step 2 using the Read tool. Follow its instructions exactly.
