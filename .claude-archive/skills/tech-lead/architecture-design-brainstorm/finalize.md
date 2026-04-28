# Finalize Architecture Design — From Brainstorm to Final

This file is read and executed by the TL agent when `/tl-design-finalize` is invoked. It takes a Slice 0 brainstorm (one or two approaches, naming options, user feedback in comments) and converges it into a single finalized `## Architecture Design` — the same format produced by the direct `/tl-design` flow.

## Inputs

- The user provides a Slice 0 issue ID/URL, or a Slices Parent / parent issue / project (resolved to Slice 0 using the same logic as the brainstorm skill Step 0).

## Process

### Step 0 — Find the Slice 0 Issue

Same resolution logic as the brainstorm skill:
1. Load the provided issue/project.
2. If it's a **project**: list its issues, find `- Slices`, then find `Slice 0: *`.
3. If it's a **Slices Parent**: list its children, find `Slice 0: *`.
4. If the title matches `Slice 0: *`, you have the target.
5. Otherwise: list children, find `- Slices`, then find `Slice 0: *`.

If no Slice 0 issue is found, report the error and **STOP**.

Verify the issue description contains `## Architecture Design — Brainstorm`. If it doesn't, report: "This issue doesn't contain a brainstorm design. Use `/tl-design` for a direct design or `/tl-design-brainstorm` to start a brainstorm." **STOP**.

### Step 1 — Gather All Context

Set the Slice 0 issue status to **"Agent Working"** via `save_issue`.

In parallel:
1. Read the issue description (the brainstorm with approaches, naming options, recommendation).
2. Call `list_comments` on the issue — read ALL comments to understand the full discussion (user preferences, answers, resolved items, follow-ups).
3. Load the slice's parent (Slices Parent) and sibling slices for context on what later slices expect.

### Step 2 — Synthesize the Final Design

Based on the brainstorm description, user comments, and resolved questions, make the final decisions:

- **Choose the approach** — pick the one the user preferred, or the recommended one if the user didn't express a preference. If the brainstorm was narrowed to one approach, use that.
- **Choose the naming** — pick from the naming options based on user feedback, or make the best choice if undecided.
- **Resolve any open questions** — use the answers from comments. If critical questions remain unanswered, note them in Step 4.
- **Incorporate all feedback** — constraints, edge cases, corrections from the discussion.

The final design should include:
1. **Tables & Columns** — full table definitions with the chosen names, types, constraints, indexes, foreign keys
2. **Associations** — final model relationships
3. **Design Decisions** — key decisions with rationale (reference the brainstorm discussion — which approach was chosen and why, which naming was picked, etc.)
4. **Migration Plan** — table creation order, any data considerations

### Step 3 — Write Finalized Design to Issue

Update the Slice 0 issue description via `save_issue`. **Replace the entire description** with the `## Architecture Design` format (same structure as the direct `/tl-design` output):

```markdown
## Architecture Design

### Context

<Brief summary of what this feature needs from a data perspective. Reference parent issues.>

### Tables & Columns

<Final table definitions with chosen names, types, constraints, indexes, foreign keys>

### Associations

<Final model relationships>

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | <chosen approach name> | <why — reference brainstorm discussion> |
| Table naming | <chosen> | <why> |
| ... | ... | ... |

### Migration Plan

<Table creation order, any data backfill or dependency notes>
```

### Step 4 — Rename Issue Title

Update the issue title via `save_issue`:
- Change from `Slice 0: Architecture & DB Design - Brainstorm` to `Slice 0: Architecture & DB Design`

### Step 5 — Mark Brainstorm Comments as Resolved

For each unresolved user comment, reply with "Resolved — incorporated into finalized design" as a threaded reply via `save_comment` using `parentId` set to that comment's ID.

### Step 6 — Post Follow-Up Questions (if needed)

If critical questions from the brainstorm remain unanswered and cannot be resolved from the discussion, post them as a comment following the format in `.claude/skills/_shared/questions-format.md`.

### Step 7 — Set Final Status

Set the slice issue status:
- **If you posted questions** → set status to **"Agent Blocked"** via `save_issue`.
- **If no questions** → set status to **"Agent Done"** via `save_issue`.

Tell the user:
- Show a link to the issue on Linear so they can review the finalized architecture.
- **If Agent Blocked**: mention they should answer questions on Linear, then run `/tl-check-comments <ISSUE-ID>`.
- **If Agent Done**: the architecture is finalized and ready for implementation. Mention `/pm <PROJECT-OR-PARENT-ID>` to continue the pipeline.

---

## Rules (Strict)

1. **Produce one finalized architecture** — the brainstorm is over. Collapse into a single design with no alternatives.
2. **Respect user preferences** — if the user chose an approach or naming in comments, use it. Don't override their decisions.
3. **If the user didn't decide**, make the best call and explain why in Design Decisions.
4. **Same output format as `/tl-design`** — the finalized description must be identical in structure to what the direct design flow produces. Downstream tools (PM, check-comments router) must not be able to tell the difference.
5. **Do NOT create sub-issues** — this skill writes to the slice issue directly.
6. **Do NOT write migration code** — describe tables, columns, and types.
7. **Do NOT modify code** — your only output is Linear issue updates and comments.
