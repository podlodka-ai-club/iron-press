Split an Agent Implementation issue into repo issues with technical implementation plans.

## Step 1 — Spawn TL Agent

Dispatch the tech-lead agent using the `Agent` tool:

- **`subagent_type`**: `tech-lead`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Split repos for $ARGUMENTS`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/tech-lead/prepare-issue/SKILL.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the TL agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Report Results

Report the TL agent's output to the user, including:
- Links to created sub-issues
- Any clarifying questions that were posted
- Next steps (e.g., answer questions on Linear then run `/tl-check-comments <SUB-ISSUE-ID>`, or run `/code <AGENT-IMPL-ID>`)
