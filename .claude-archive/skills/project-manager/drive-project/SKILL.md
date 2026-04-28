---
name: drive-project
description: "Drive a Linear project or individual issue through the agent pipeline. Classifies the input, walks the issue tree to find actionable items, and outputs the next commands to run."
---

## Hard Constraint

**NEVER skip the pipeline.** Every issue must go through BA → TL → Code. Do not suggest implementing directly, do not propose skipping BA or TL for "simple" issues. The only you output are next commands.

## Step 0 — Parse & Classify

### 0a. Parse Arguments

1. Split the arguments string. Extract:
   - `<ID>` (required) — the first non-flag argument
   - `--dry-run` (optional) — report only, no dispatch
   - `--ba=<mode>` (optional) — `analyze` (default) or `slice`:
     - `analyze`: use `/ba` to create a single Agent Implementation
     - `slice`: use `/ba-slice-issue` to break into slices first
   - `--design=<mode>` (optional) — `direct` (default) or `brainstorm`:
     - `direct`: dispatch `/tl-design` for Slice 0
     - `brainstorm`: dispatch `/tl-design-brainstorm` for Slice 0, and pass `--design=brainstorm` to `/ba-slice-issue`
2. If `<ID>` is missing, report error: "Usage: /pm <ID> [--dry-run] [--ba=analyze|slice] [--design=direct|brainstorm]" and stop.

### 0b. Resolve & Classify

Determine the ID type and resolve:

- **Linear project URL** (contains `linear.app/...project/`) → call `get_project(<slug>)` → type is **Project**
- **Issue identifier or URL** → call `get_issue(<ID>)` → classify by title:

| Pattern | Type |
|---------|------|
| Title ends with `- Agent Implementation` | **Agent Implementation** |
| Title ends with `- Slices` | **Slices Parent** |
| Title starts with `Slice \d+:` | **Slice** |
| Parent title ends with `- Agent Implementation` | **Repo Issue** |
| None of the above | **Feature Issue** |

For Repo Issues: if classification is unclear from the title, load the parent issue. If the parent's title ends with `- Agent Implementation`, it's a Repo Issue.

## Step 1 — Walk Issue Tree

Starting from the classified input, navigate down to find all **actionable issues**. This step is pure navigation — no commands are decided yet.

### Containers (recurse into children):

**Project:**
1. `list_issues` for the project (`includeArchived: false`).
2. If zero issues → the project itself is actionable (needs bootstrapping). Stop.
3. Find Slices Parent (title ends `- Slices`) → recurse.
4. Else find Agent Implementation (title ends `- Agent Implementation`, no Slice parent) → recurse.
5. If neither found → report unrecognized structure and stop.

**Feature Issue:**
1. List children for the issue (`includeArchived: false`).
2. If no children → the feature issue is actionable. Stop.
3. If child title ends `- Agent Implementation` → recurse into that child.
4. If child title ends `- Slices` → recurse into that child.
5. If all children Done → note "All sub-issues done".

**Slices Parent:**
1. If status is "Agent Blocked" → collect as actionable. Also continue checking slices.
2. List children (slice issues).
3. If no children or status is "Todo" → collect as actionable (needs slicing). Stop.
4. Parse the **Slices table** from the description (columns: `# | Issue | Summary | Dependencies`).
5. For each slice (sorted by number), check eligibility:
   - If slice **already has an Agent Implementation child** → recurse (deps satisfied).
   - Otherwise → all dependency slices must be "Done". If not → skip ("blocked by dependencies").
6. **One-at-a-time dispatch**: Among newly eligible slices (no Agent Impl child yet), only process the **lowest-numbered** eligible slice. Do not dispatch multiple slices in parallel — process one slice at a time to keep the pipeline focused.
7. For each eligible slice (already in progress or the single next one) → recurse.

**Slice:**
1. If status is Done → skip ("completed").
2. If status is Agent Working → skip ("in progress").
3. If status is Agent Blocked → collect as actionable.
4. **Slice 0 title suffixes:**
   - Title ends with `- Empty` → collect as actionable (needs design). Stop.
   - Title ends with `- Brainstorm` → if Agent Done, note "Brainstorm complete — run `/tl-design-finalize <sliceId>`". Stop. Otherwise handled by status (steps 1-3).
   - No suffix → design complete, continue below.
5. List children. If no child title ends with `- Agent Implementation` → collect as actionable (needs BA). Stop.
6. If Agent Implementation child exists → recurse into it.

**Agent Implementation:**
1. If status is Todo / Agent Working / Agent Blocked → collect as actionable. Stop.
2. If status is Agent Done or Done:
   - List children (Repo Issues).
   - If no children → collect as actionable (needs TL). Stop.
   - If children exist → collect each Repo Issue as a leaf.

### Leaves:

**Repo Issue**: Always a leaf — collect directly.

## Step 2 — Determine Actions

For each actionable issue collected in Step 1, determine the command using the tables below.

### Universal status rules (apply first, override type-specific rules):

| Status | Action |
|--------|--------|
| Agent Working / In Progress | Skip ("in progress") |
| Done | Skip ("completed") |
| Agent Blocked | → **Check Comments** (below) |

### Check Comments (for any Agent Blocked issue):

1. Call `list_comments(issueId)`.
2. Find the most recent comment starting with `## Questions from`.
3. Check for human replies created **after** that comment (replies that don't start with `## Questions from` and aren't just "Resolved").
4. **If answers exist**:
   - Agent Implementation or Slices Parent → `/ba-check-comments <id>`
   - Slice 0 (title starts with `Slice 0:`) → `/tl-check-comments <id>`
   - Slice (1+) → `/ba-check-comments <id>`
   - Repo Issue → `/tl-check-comments <id>`
5. **If no answers**:
   - **Agent Implementation** → `/po <id>` (PO answers the BA questions)
   - All other types → skip ("waiting for answers")

### Type-specific actions:

| Type | Condition | Action |
|------|-----------|--------|
| **Project** | zero issues, `--ba=slice` | `/ba-slice-issue <projectId>` (+ `--design=brainstorm` if set) |
| **Project** | zero issues, `--ba=analyze` | `/ba <projectId>` |
| **Feature Issue** | no children, `--ba=slice` | `/ba-slice-issue <issueId>` (+ `--design=brainstorm` if set) |
| **Feature Issue** | no children, `--ba=analyze` | `/ba <issueId>` |
| **Slices Parent** | Todo or no children | `/ba-slice-issue <issueId>` (+ `--design=brainstorm` if set) |
| **Slice 0** | title ends `- Empty`, `--design=brainstorm` | `/tl-design-brainstorm <sliceId>` |
| **Slice 0** | title ends `- Empty`, otherwise | `/tl-design <sliceId>` |
| **Slice 0** | Agent Done, title ends `- Brainstorm` | Note: "run `/tl-design-finalize <sliceId>`" |
| **Slice (1+)** | no Agent Impl child, deps met | `/ba <sliceId>` |
| **Agent Impl** | Todo | `/ba <id>` |
| **Agent Impl** | Agent Done, no children, no PO review | `/po <id>` |
| **Agent Impl** | Agent Done, no children, PO reviewed | `/tl <id>` |
| **Agent Impl** | Agent Done/Done, has children | → **Evaluate Repo Issues** (below) |
| **Repo Issue** | Todo, no sibling in progress | `/code <parentAgentImplId>` |
| **Repo Issue** | Agent Done | Note: "ready for review" |

### Detecting PO review:

To determine if the PO has already reviewed an Agent Implementation issue, call `list_comments(issueId)` and check if any comment body starts with `## PO Approved` or `## PO Review Feedback`. If either exists, the PO has reviewed.

### Evaluate Repo Issues (priority order — first match wins):

When an Agent Implementation has children, evaluate them in this order:

1. **Any** child is Agent Blocked (with answers) → `/tl-check-comments <childId>` per blocked child
2. **Any** child is Agent Working or In Progress → skip ("code in progress")
3. **Any** child is Todo → `/code <agentImplId>` (the `/code` command takes the Agent Implementation ID, not the sub-issue ID)
4. **All** children Done → note "All sub-issues done"
5. **Some** children Agent Done → note "ready for review"

## Step 3 — Output & Report

Sort actions by priority:
1. Check-comments (unblock existing work first)
2. Code dispatch (implement ready work)
3. TL dispatch (advance pipeline)
4. PO review (validate before TL)
5. BA analyze (start new work)
6. BA slice / bootstrap (create slices)

Output:

```
## PM Report — <issue/project name> — <timestamp>

**Input**: <issue ID> (<classification>)
**Structure**: Direct / Slices / Feature Issue / New Project

| Issue | Type | Status | Action |
|-------|------|--------|--------|
| ENG-123 | Agent Implementation | Todo | `/ba ENG-123` |
| ENG-456 | Agent Implementation | Agent Blocked | `/ba-check-comments ENG-456` |
| ENG-789 | Agent Implementation | Agent Done | `/tl ENG-789` |
| ENG-101 | Slice 1: CRUD UI | Todo | Blocked by Slice 0 |
| ENG-200 | Repo Issue (Backend) | Todo | `/code ENG-199` |

### Next Commands

    /ba-check-comments ENG-456
    /code ENG-199
    /tl ENG-789
    /ba ENG-123
```

If `--dry-run`, label commands as "Would run" instead of "Next Commands".

If no actionable issues:

```
## PM Report — <name> — <timestamp>

**Input**: <ID> (<classification>)

No actionable items. All issues are either in progress, waiting for answers, or have unmet dependencies.

### Current State
| Issue | Type | Status | Notes |
|-------|------|--------|-------|
| ... | ... | ... | ... |
```
