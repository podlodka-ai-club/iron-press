Check comments on a BA-owned Linear issue and update it based on answers and feedback.

## Step 1 — Spawn BA Agent

Dispatch the business-analyst agent using the `Agent` tool:

- **`subagent_type`**: `business-analyst`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Check comments for $ARGUMENTS`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/business-analyst/check-comments/SKILL.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the BA agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Report Results

Report the BA agent's output to the user, including:
- What changed in the issue based on comments
- Any new questions that were posted
- Next steps (e.g., answer questions on Linear then run `/ba-check-comments <ISSUE-ID>`, or run `/tl <ISSUE-ID>`)
