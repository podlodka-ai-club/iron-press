---
name: architecture-design
description: "Design the database architecture for a feature's first slice (Architecture & DB Design). Investigates the codebase and existing DB structure, makes opinionated decisions, and writes a finalized architecture directly into the slice issue. Straightforward flow — produces the best solution, posts questions if needed."
---

## Purpose

This skill is for the **first slice** of a sliced feature — the Architecture & DB Design slice. It produces the single best solution based on thorough codebase research and the tech lead's judgment. No alternatives, no brainstorming.

The output is written directly into the Slice 0 issue description. Questions (if any) are posted as a comment.

## Process

### Step 0 — Find or Create the Slice 0 Issue

The user provides one of:
- A **Slice 0 issue** ID/URL (title matches `Slice 0: *`)
- A **Slices Parent** issue ID/URL (title ends with `- Slices`) — find Slice 0 among its children
- A **parent issue** ID/URL — find the Slices child, then find Slice 0
- A **project** ID/URL — find the Slices Parent issue in the project, then find Slice 0

Resolution logic:
1. Load the provided issue/project.
2. If it's a **project**: list its issues, find the one whose title ends with `- Slices`. That's the Slices Parent.
3. If it's a **Slices Parent** (title ends with `- Slices`): list its children, find `Slice 0: *`.
4. If it's neither a Slice nor Slices Parent: list its children, find the `- Slices` child, then find `Slice 0: *` among its children.
5. If the resolved issue title matches `Slice 0: *`, you have the target.

**If no Slice 0 issue is found** but a Slices Parent was resolved, create it:
- `team`: "Engineering"
- `parentId`: the Slices Parent issue ID
- `project`: same project as the Slices Parent (if any)
- `state`: "Todo"
- `title`: `Slice 0: Architecture & DB Design - Empty`
- `description`: *(leave empty — this skill will populate it)*

If no Slices Parent can be found either, report the error and **STOP**.

### Step 1 — Gather Context

Set the Slice 0 issue status to **"Agent Working"** via `save_issue`.

Then gather ALL context in parallel:

#### 1a. Linear Context
- Load the slice issue's **parent** (the Slices Parent) via `get_issue` using `parentId`. Read its description (slice table, phases, base branch).
- From the Slices Parent, walk up: load ITS parent (the project starting issue) if it has one. Read the description.
- If any issue belongs to a **project**, load the project via `get_project` (with `includeResources: true`). Read description, resources.
- List **sibling slices** (children of the Slices Parent) to understand the full feature scope and what later slices expect from this architecture.

#### 1b. Figma / Prototype Context (if found in project or issue descriptions)
- Call `get_design_context` if a Figma URL is found.
- Read prototype page source if a prototype reference is found.
- Note data shapes, entity relationships, and UI patterns that imply DB structure.

#### 1c. Codebase Investigation

This is the most critical step. Investigate thoroughly:

- **Read project CLAUDE.md files** — `backend-app/CLAUDE.md`, root `CLAUDE.md`.
- **Read `.claude/agents/knowledge/tech-lead.md`** for accumulated patterns.
- **Explore existing DB schema** — read `/db/schema.rb` (search for relevant tables, look at naming patterns, column conventions, index patterns).
- **Find related models** — grep for models that touch the same domain. Read their associations, validations, enums, scopes.
- **Find related services** — understand existing patterns the new feature will integrate with.
- **Find related migrations** — understand how similar features were added historically.
- **Identify naming conventions** — how are tables named? Column prefixes? Enum value patterns? Join table naming?

### Step 2 — Design the Architecture

Based on your research, design **the single best architecture** for this feature. Make opinionated decisions:

- Choose the best domain modeling approach (normalized vs. denormalized, polymorphic vs. STI vs. dedicated tables, etc.)
- Choose the best naming that's consistent with the existing codebase
- Choose the right level of normalization for the use case
- Make trade-off decisions and document your reasoning

The design should include:

1. **Tables & Columns** — full table definitions with column names, types, constraints, indexes, foreign keys
2. **Associations** — how models relate to each other and to existing models
3. **Design Decisions** — key decisions you made and why (what you considered and why you chose this direction)
4. **Migration Plan** — table creation order, any data considerations

### Step 3 — Clarifying Questions

After designing, determine if you have questions about scope, data ownership, lifecycle, edge cases, or ambiguities that could significantly affect the architecture.

If you have questions, still proceed to Step 4 — you will post them as a comment after writing the design.

### Step 4 — Write to Slice Issue

Update the Slice 0 issue via `save_issue` with:
- **`title`**: `Slice 0: Architecture & DB Design` (remove any suffix like `- Empty`)
- **`description`**: the following structure:

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

### Step 5 — Post Questions as Comment (if needed)

If you have clarifying questions from Step 3, post them as comments on the slice issue following the format in `.claude/skills/_shared/questions-format.md`

### Step 6 — Set Final Status

Set the slice issue status:
- **If you posted questions** → set status to **"Agent Blocked"** via `save_issue`.
- **If no questions** → set status to **"Agent Done"** via `save_issue`.

Tell the user:
- Show a link to the issue on Linear so they can review the architecture.
- **If Agent Blocked**: mention they should answer questions on Linear, then run `/tl-check-comments <ISSUE-ID>`.
- **If Agent Done**: the architecture is finalized and ready for implementation. Mention they can run `/pm <PROJECT-OR-PARENT-ID>` to continue the pipeline.
- In both cases, mention `/tl-design-brainstorm <SLICE-ID>` if they want to explore alternative approaches instead.

---

## Rules (Strict)

1. **Produce one finalized architecture** — no alternatives, no "Approach A vs B". Make the best decision.
2. **Be opinionated** — you are the tech lead. Choose the right solution and defend it with reasoning.
3. **Document your reasoning in Design Decisions** — explain what you considered and why you chose this direction, so the user understands your thinking.
4. **Do NOT create sub-issues** — this skill writes to the slice issue directly.
5. **Do NOT write migration code** — describe tables, columns, and types. The implementation agent writes the actual code.
6. **Research the existing schema thoroughly** — naming and structure must be consistent with the existing database.
7. **Reference existing patterns** — show how similar features were structured in the codebase.
8. **Use parallel tool calls** during research.
9. **Do NOT modify code** — your only output is Linear issue updates and comments.
