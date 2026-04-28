Break a large Linear project or epic into smaller, independently deployable slices.

Accepts an optional `--design=brainstorm` flag. If present, Slice 0 will reference `/tl-design-brainstorm` instead of the default `/tl-design`.

## Step 1 — Spawn BA Agent

Dispatch the business-analyst agent using the `Agent` tool:

- **`subagent_type`**: `business-analyst`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Slice issue for $ARGUMENTS`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/business-analyst/slice-issue/SKILL.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the BA agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Report Results

Report the BA agent's output to the user, including:
- Link to the Slices parent issue
- Any clarifying questions that were posted
- Next steps (e.g., answer questions on Linear, then run `/ba-check-comments <ISSUE-ID>`)
