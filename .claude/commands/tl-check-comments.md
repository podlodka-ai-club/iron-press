Check comments on a TL-owned Linear issue and update it based on answers and feedback.

## Step 1 — Spawn TL Agent

Dispatch the tech-lead agent using the `Agent` tool:

- **`subagent_type`**: `tech-lead`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Check comments for $ARGUMENTS`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/tech-lead/check-comments/SKILL.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the TL agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Report Results

Report the TL agent's output to the user, including:
- What changed in the sub-issue based on comments
- Any new questions that were posted
- Next steps (e.g., answer questions on Linear then run `/tl-check-comments <SUB-ISSUE-ID>`, or run `/code <AGENT-IMPL-ID>`)
