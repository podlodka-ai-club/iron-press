Finalize a brainstorm architecture design into a single architecture for Slice 0.

## Step 1 — Spawn TL Agent

Dispatch the tech-lead agent using the `Agent` tool:

- **`subagent_type`**: `tech-lead`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Finalize architecture for $ARGUMENTS`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/tech-lead/architecture-design-brainstorm/finalize.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the TL agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Report Results

Report the TL agent's output to the user, including:
- Link to the slice issue with the finalized architecture
- Summary of key design decisions (which approach was chosen, naming)
- Next steps: the architecture is ready for implementation
