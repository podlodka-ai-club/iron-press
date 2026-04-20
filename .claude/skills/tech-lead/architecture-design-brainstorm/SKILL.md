---
name: architecture-design-brainstorm
description: "Brainstorm the database architecture for a feature's first slice (Architecture & DB Design). Proposes two strong architectural approaches with naming alternatives, posts questions as comments, and sets the issue to Agent Blocked for discussion. The user reviews, answers questions, and later runs /tl-design-finalize to converge on a final solution."
---

## Purpose

This skill is for the **first slice** of a sliced feature — the Architecture & DB Design slice. Instead of jumping straight to a final design, it helps the user **think through the design** by presenting two strong approaches, naming options, and thoughtful questions.

Use this when you want to explore trade-offs and discuss the architecture before committing. For a direct best-solution design, use `/tl-design` instead.

The output is written directly into the Slice 0 issue description and questions are posted as a comment.

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
4. If the resolved issue title matches `Slice 0: *`, you have the target.
5. If it's neither a Slice nor Slices Parent: list its children, find the `- Slices` child, then find `Slice 0: *` among its children.

**If no Slice 0 issue is found** but a Slices Parent was resolved, create it:
- `team`: "Engineering"
- `parentId`: the Slices Parent issue ID
- `project`: same project as the Slices Parent (if any)
- `state`: "Todo"
- `title`: `Slice 0: Architecture & DB Design - Empty`
- `description`: *(leave empty — this skill will populate it and rename to `- Brainstorm`)*

If no Slices Parent can be found either, report the error and **STOP**.

### Step 1 — Gather Context

Set the Slice 0 issue status to **"Agent Working"** via `save_issue`.

Then gather ALL context in parallel:

#### 1a. Linear Context
- Load the slice issue's **parent** (the Slices Parent) via `get_issue` using `parentId`. Read its description (slice table, phases, base branch).
- From the Slices Parent, walk up: load ITS parent (the project starting issue) if it has one. Read the description.
- If any issue belongs to a **project**, load the project via `get_project` (with `includeResources: true`). Read description, resources.
- List **sibling slices** (children of the Slices Parent) to understand the full feature scope and what later slices expect from this architecture.

#### 1b. Figma Context (if found in project or issue descriptions)
- Call `get_design_context` if a Figma URL is found.
- Note data shapes, entity relationships, and UI patterns that imply DB structure.

#### 1c. Codebase Investigation

This is the most critical step. Investigate thoroughly:

- **Read project CLAUDE.md files** — `backend-app/CLAUDE.md`, root `CLAUDE.md`.
- **Read `.claude/agents/knowledge/tech-lead.md`** for accumulated patterns.
- **Explore existing DB schema** — read `backend-app/db/schema.rb` (search for relevant tables, look at naming patterns, column conventions, index patterns).
- **Find related models** — grep for models that touch the same domain. Read their associations, validations, enums, scopes.
- **Find related services** — understand existing patterns the new feature will integrate with.
- **Find related migrations** — understand how similar features were added historically.
- **Identify naming conventions** — how are tables named? Column prefixes? Enum value patterns? Join table naming?

### Step 2 — Design Architectural Options

Based on your research, design **two distinct architectural approaches**.

**CRITICAL: Both approaches must be strong, production-grade solutions that a senior architect would be proud to defend.** The point is to give the user two genuinely different *good* directions to think about — not a "recommended approach vs. obviously worse fallback." If one approach is clearly inferior (e.g., "just add columns to existing tables" vs. a properly designed schema), it fails the purpose of this skill. Think about:
- Different domain modeling philosophies (e.g., normalized vs. denormalized, event-sourced vs. CRUD, polymorphic vs. STI vs. dedicated tables)
- Different integration patterns (e.g., sync table vs. event log, push vs. pull, per-record vs. batch)
- Different boundary decisions (e.g., where the domain cut happens, what's a first-class entity vs. an attribute)

Each approach should have real strengths that make the other approach's weaknesses apparent. The user should genuinely struggle to choose.

For each approach:

1. **Approach name** — a short descriptive label (e.g., "Dedicated schema with sync tracking", "Event-sourced integration log")
2. **Core idea** — 2-3 sentences explaining the philosophy and why an architect would choose this
3. **Tables & columns** — full table definitions with column names, types, constraints, indexes, foreign keys
4. **Associations** — how models relate to each other and to existing models
5. **Trade-offs** — strengths and weaknesses of this approach (performance, flexibility, complexity, consistency with existing patterns)

### Step 3 — Naming Alternatives

For each approach, propose **2-3 naming variants** for the key tables and columns. Present them in a comparison table.

Consider:
- Consistency with existing codebase naming
- Domain clarity (does the name communicate what it stores?)
- Brevity vs. explicitness
- Rails conventions (singular model, plural table, `_id` foreign keys, `_type` for polymorphic)
- Existing namespace/prefix patterns in the codebase

Example format:
```
### Naming Options for Approach A

| Concept | Option 1 | Option 2 | Option 3 |
|---------|----------|----------|----------|
| Main table | `pay_captain_employees` | `pc_employee_syncs` | `employee_payroll_links` |
| Status column | `sync_status` | `pc_status` | `payroll_sync_state` |
| FK to employee | `employee_id` | `employee_id` | `employee_id` |
```

### Step 4 — Formulate Questions

Think deeply about the design and identify questions that will help the user make better decisions. Categories:

- **Data ownership** — which system is the source of truth? What happens on conflicts?
- **Lifecycle** — when are records created/updated/deleted? What triggers state transitions?
- **Scope** — does this apply to all businesses or a subset? Per-business configuration?
- **Edge cases** — what happens when related records are deleted? Bulk operations? Concurrency?
- **Naming** — which naming feels right? Any domain conventions to follow?
- **Approach preference** — which approach resonates more? Any constraints I missed?

Keep questions open-ended — no multiple-choice or lettered options. The user will answer descriptively.

### Step 5 — Write to Slice Issue

Update the Slice 0 issue via `save_issue` with:
- **`title`**: `Slice 0: Architecture & DB Design - Brainstorm` (rename from `- Empty` or whatever the current suffix is)
- **`description`**: the following structure:

```markdown
## Architecture Design — Brainstorm

### Context

<Brief summary of what this feature needs from a data perspective. Reference parent issues.>

### Approach A: <Name>

<Core idea>

#### Tables & Columns

<Full table definitions>

#### Associations

<Model relationships>

#### Trade-offs

<Strengths and weaknesses>

#### Naming Options

<Comparison table>

---

### Approach B: <Name>

<Core idea>

#### Tables & Columns

<Full table definitions>

#### Associations

<Model relationships>

#### Trade-offs

<Strengths and weaknesses>

#### Naming Options

<Comparison table>

---

### Recommendation

<Which approach you lean toward and why — but acknowledge the trade-off>
```

### Step 6 — Post Questions as Comment

Post questions on the slice issue via `save_comment`. Questions should be open-ended — the user will answer manually and descriptively. Do NOT use lettered options or multiple-choice format.

```markdown
## Questions from Tech Lead

Please reply to this comment with your answers.

1. **[Approach]** Which architectural approach do you prefer, and why? Are there constraints I missed that would rule one out?

2. **[Naming]** Looking at the naming options for the main table — which feels right? Any naming conventions from the domain I should follow?

3. **[Data Ownership]** <open question>?

4. **[Lifecycle]** <open question>?
...
```

### Step 6.5 — Set Final Status

- Set the slice issue status to **"Agent Blocked"** via `save_issue` (always blocked — questions require answers before proceeding).

Tell the user:
- Show a link to the issue on Linear so they can review the design and answer questions.
- Mention they can run `/tl-design-finalize <ISSUE-ID>` after answering to finalize the architecture.

---

## Rules (Strict)

1. **Always propose two strong approaches** — both must be production-grade solutions a senior architect would defend. NEVER propose a weak "just extend existing tables" option as filler. If you can't think of two genuinely different good approaches, think harder — consider different modeling philosophies, integration patterns, or domain boundaries.
2. **Always propose naming alternatives** — naming is one of the hardest decisions; give options.
3. **Always post questions** — architecture decisions need human input. This skill always sets Agent Blocked.
4. **Do NOT create sub-issues** — this skill writes to the slice issue directly, not sub-issues.
5. **Do NOT write migration code** — describe tables, columns, and types. The implementation agent writes the actual code.
6. **Research the existing schema thoroughly** — naming and structure must be consistent with the existing database.
7. **Reference existing patterns** — show how similar features were structured in the codebase.
8. **Use parallel tool calls** during research.
9. **Do NOT modify code** — your only output is Linear issue updates and comments.
