Brainstorm the database architecture for a feature's first slice (Architecture & DB Design) — two approaches with trade-offs for discussion.

## Step 1 — Spawn TL Agent

Dispatch the tech-lead agent using the `Agent` tool:

- **`subagent_type`**: `tech-lead`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Architecture brainstorm for $ARGUMENTS`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/tech-lead/architecture-design-brainstorm/SKILL.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the TL agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Report Results

Report the TL agent's output to the user, including:
- Link to the slice issue with the architecture brainstorm
- Summary of the two approaches proposed
- Mention that questions were posted as a comment
- Next steps: answer questions on Linear, then run `/tl-design-finalize <ISSUE-ID>` to converge on a final solution
