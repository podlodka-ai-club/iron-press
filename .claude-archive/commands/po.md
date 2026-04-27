Review a BA-written Agent Implementation issue as the Product Owner. Answers BA questions as reply comments and posts description feedback as separate comments.

## Step 1 — Spawn PO Agent

Dispatch the product-owner agent using the `Agent` tool:

- **`subagent_type`**: `product-owner`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `PO review for $ARGUMENTS`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/product-owner/check-issue/SKILL.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the PO agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Report Results

Report the PO agent's output to the user, including:
- Summary of decisions made (questions answered, feedback given)
- Whether the issue was approved or needs BA rework
- Next steps:
  - If feedback/answers were posted: `/ba-check-comments <ISSUE-ID>` to have the BA process PO input
  - If approved with no comments: `/tl <ISSUE-ID>` to hand off to the Tech Lead agent
