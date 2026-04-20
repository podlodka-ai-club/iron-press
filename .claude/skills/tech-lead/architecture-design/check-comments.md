# Check Comments — Slice Architecture Design (Direct)

This file is read and executed by the TL agent when `/tl-check-comments` routes to a Slice 0 issue that used the direct architecture design flow.

## Inputs

- `issueId` — the Slice issue ID (already loaded by router)

## Process

### Step 1 — Read Current State

1. Load the slice issue via `get_issue` to read the current description (Architecture Design section). Set status to **"Agent Working"** via `save_issue`.
2. Call `list_comments` on the issue.
3. Load the slice's parent (Slices Parent) and sibling slices for context if needed.

### Step 2 — Analyze Comments

Read ALL comments. Identify which comments are **unhandled** — comments that do NOT have a "Resolved" threaded reply from the agent.

Comments may include:
- Answers to questions posted by the TL agent
- Corrections to the proposed architecture (table structure, naming, associations)
- Additional constraints or requirements that affect the design
- Requests to revise specific design decisions
- Edge case clarifications
- Any other feedback

### Step 3 — Update Architecture Design

Based on the user's answers, update the slice issue description via `save_issue`. Revise the **Architecture Design** section to incorporate the feedback:

- Update table definitions if schema changes are needed
- Revise naming based on user preferences
- Adjust associations or constraints
- Update the Design Decisions table with any changed rationale
- Revise the Migration Plan if affected

**Keep the format same**:

```markdown
## Architecture Design

### Context

<Brief summary of what this feature needs from a data perspective. Reference parent issues.>

### Tables & Columns

<Full table definitions with names, types, constraints, indexes, foreign keys>

### Associations

<Model relationships — how new models relate to each other and existing models>

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Modeling approach | <chosen> | <why — what alternatives you considered> |
| Table naming | <chosen> | <why — consistency with existing patterns> |
| ... | ... | ... |

### Migration Plan

<Table creation order, any data backfill or dependency notes>
```

### Step 4 — Mark Comments as Resolved

For each user comment that you handled, reply with "Resolved" as a threaded reply via `save_comment` using `parentId` set to that comment's ID.

### Step 5 — Post Follow-Up Questions (if needed)

If the comments raise NEW questions or ambiguities you cannot resolve, post a follow-up questions comment following the format in `.claude/skills/_shared/questions-format.md`.

### Step 6 — Set Final Status

Set the status on the slice issue:
- **If you posted NEW follow-up questions** → set status to **"Agent Blocked"** via `save_issue`.
- **If all questions are resolved and the design is updated** → set status to **"Agent Done"** via `save_issue`.

### Step 7 — Report to User

Tell the user what changed and whether any new questions remain:
- **If you posted NEW follow-up questions** → show a link to the issue so the user can review and answer on Linear.
- **If the design is finalized** → note that the architecture is ready for implementation. Mention `/pm <PROJECT-OR-PARENT-ID>` to continue the pipeline.
