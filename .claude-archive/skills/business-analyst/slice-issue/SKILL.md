---
name: slice-issue
description: "Use when a large Linear project or epic needs to be broken into smaller, independently deployable slices (increments) before entering the BA → TL pipeline. Each slice delivers user-observable value and can be implemented independently. Creates a Slices parent issue and slice child issues in Linear. Does NOT write code."
---

## Critical Principle: Stay Concise

Your job is to define **slice boundaries and ordering only**. You do NOT write detailed descriptions.

- **Slice descriptions**: Short. Slice Context (1-2 sentences) + Scope (feature area bullets, 5-7 max per slice).
- **Slices parent**: Short. Just a slice table and phases. No project context (BA reads that from the Linear project).
- **No detailed feature descriptions** — the BA agent does that later separately.
- **No technical implementation details** — the TL agent does that later separately.
- **NEVER include questions in the issue description** — questions go ONLY in a separate comment posted.

The Linear team is always **Engineering (ENG)**.

## Downstream Pipeline

```
/ba-slice-issue → creates Slices parent + slice child issues
    ↓
For each slice independently:
    /ba <SLICE-ID> → BA creates "Agent Implementation" child with business requirements
        /tl → TL creates repo issues with technical details
            → Implementation agents write code
```

Your slices must be structured so that:
- Each slice is a standard Linear issue that the BA agent can process via `/ba <SLICE-ID>` (Type B flow)
- Slices are independent enough to be implemented in any order (respecting stated dependencies)

## Process

### Step 0 — Parse Input

Check for the `--design=brainstorm` flag in the arguments. If present, the design mode is **brainstorm**; otherwise it defaults to **direct**. Strip the flag from the arguments before parsing the rest.

Determine the input type:

**Type A: From a Linear project** — when the user provides a Linear project URL or name. Extract:
1. **Linear project** (REQUIRED)
2. **Figma URL** (optional) — may come from project description/resources.
3. **Prototype reference** (optional) — may come from project description.
4. **Feature description** — everything else provided by the user.

**Type B: From a Linear issue** — when the user provides a Linear issue ID or URL. Extract:
1. **Linear issue** (REQUIRED)
2. **Figma URL** (optional) — from arguments or discovered from issue/project.
3. **Prototype reference** (optional) — from arguments or discovered from issue/project.
4. **Feature description** — everything else.

**If neither a project nor an issue is provided**, ask the user for one and wait.

### Step 1 — Create Slices Parent Issue

Create immediately after parsing input:

**For Type A (project-based):**
- `team`: "Engineering"
- `project`: the Linear project from Step 0
- `state`: "Agent Working"
- `assignee`: "me"
- `title`: `<Project Name> - Slices`
- `description`: (placeholder — will be filled in Step 6)

**For Type B (issue-based):**
- `team`: "Engineering"
- `parentId`: the starting issue's ID
- `project`: the starting issue's project (if it has one)
- `state`: "Agent Working"
- `assignee`: "me"
- `title`: `<Issue Title> - Slices`
- `description`: (placeholder — will be filled in Step 6)

### Step 2 — Deep Research

Do ALL of the following that apply. Use parallel tool calls where possible.

#### 2a. Linear Context

**For Type A:** Load project via `get_project` (with `includeResources: true`), list issues, list documents, check for Figma/prototype references.

**For Type B:** Load issue via `get_issue`, load parent project if any, list child issues, check for Figma/prototype references.

#### 2b. Figma Context (if URL found)
- Call `get_design_context` and `get_screenshot`.
- Identify natural UI groupings that could map to slices.

#### 2c. Prototype Context (if path or page name found)
- Read the prototype page source. Do NOT modify the prototype.
- Identify distinct pages/sections that could map to slices.

#### 2d. Codebase Exploration

This is critical — natural slice boundaries come from the code structure:
- Read project-specific CLAUDE.md files for affected projects.
- Find relevant models, controllers, services, routes in `backend-app/`.
- Find relevant frontend components, routes, hooks in frontends.
- Identify **natural seams**: independent models, separate API endpoints, distinct user workflows, background jobs, separable config/settings.

### Step 3 — Identify Slicing Strategy

1. **Slice 0 is always Architecture & DB Design** — for greenfield features, slice 0 covers models, migrations, associations, roles, policies, and factories ONLY. No API controllers, no frontend, no services. This is the foundation.
2. **Minimize cross-slice dependencies** — prefer slices that can be built in parallel.
3. **Prefer thin end-to-end slices** — one complete workflow (backend + frontend) per slice. (Exception: Slice 0 architecture is layer-only by design.)
4. **Order by risk/learning** — put uncertain or risky slices early.
5. **Group by user workflow** — not by technical component.
6. **Backend-only slices are OK** if they deliver independent value.
7. **Keep slices small** — if a slice feels too big, split it further.
8. **Respect existing code seams**.

### Step 4 — Clarifying Questions

After research, determine if you have questions that cannot be answered from the research above. Organize questions into these categories (skip categories where you already have answers):

- **Scope** — what's in vs. out?
- **Priority** — which workflows ship first?
- **Dependencies** — external APIs, other teams, data migrations?
- **User workflows** — ambiguous flows that affect slice grouping.

#### Formatting questions with options

When a question has a discrete set of possible answers, list them as lettered options (a, b, c, …) — each on its own line for easy copy-paste. Mark the recommended option with *(recommended)*. Only propose options when the question naturally has distinct alternatives; for open-ended questions, just ask plainly.
If your research already led you to **assume** one of the options (i.e., the slices already reflect that choice), mark it with *(current)*.
Place the *(current)* or *(recommended)* option first (as option a).

Example:
```
2. **[Scope]** Should webhook processing be part of this feature or a separate project?
   a) Include in this feature as a dedicated slice *(recommended)*
   b) Separate project — out of scope for now
```

If you have no questions, skip to Step 5. If you do have questions, still proceed to Step 5 — you will post questions as a comment after updating the Parent Issue in Step 6.

### Step 5 — Create Slice Issues

Create each slice as a child of the Slices parent:

- `team`: "Engineering"
- `parentId`: the Slices parent issue ID
- `project`: same project as the parent
- `state`: "Todo"
- `title`: `Slice N: <Short Description>`
- `description`: slice body (see Slice Issue Template below)

**Exception — Slice 0 (Architecture & DB Design):** Slice 0 does not need Slice Context or Scope — the TL design command will populate it.
- **Title**: `Slice 0: Architecture & DB Design - Empty` (always — the TL design skill will rename it when it runs)
- **Description** based on the `--design` flag:
  - **Default (direct):** `Run /tl-design to fulfill this issue.`
  - **`--design=brainstorm`:** `Run /tl-design-brainstorm to fulfill this issue.`

Create slices in recommended implementation order (Slice 0 first).

### Step 6 — Update Slices Parent Issue

Update the Slices parent with the Slices Parent Issue Template (see below).

If you have clarifying questions from Step 4, post them as a comment on the Slices parent following the format in `.claude/skills/_shared/questions-format.md`.

Tell the user:
- Show a link to the issue on Linear so they can review and answer questions there.
- Mention they can run `/ba-check-comments <ISSUE-ID>` after answering to have you read the answers and update the issue.

### Step 6.5 — Set Final Status on Slices Parent Issue

- **If you posted clarifying questions** → set status to **"Agent Blocked"**.
- **If no remaining questions** → set status to **"Agent Working"**.

---

## Slice Issue Template

Keep concise. Define boundaries precisely but briefly. No detailed descriptions, no technical implementation. Dependencies live only in the Slices Parent table — not in individual slices.

**Scope items must be short** — a few words each. No parenthetical explanations, no clarifications in brackets. If you need more than ~5 words per bullet, you're being too detailed.

Example:

```
## Slice Context                                                                                                                                                                                       
                                                                                                                                                                                                      
Build the outbound sync that creates/updates product listings in Shopify whenever catalog data changes in our internal PIM. This is the bridge between PIM-sourced product data and Shopify's       
storefront system.                                                                                                                                                                                  
                                                                                                                                                                                                  
## Scope                                                                                                                                                                                               
                                                                                                                                                                                                  
- Shopify product CRUD endpoints                                                                                                                                                                    
- Product data sync service                                                                                                                                                                         
- Pre-launch bulk sync                                                                                                                                                                              
- Per-product sync status tracking                                                                                                                                                                  
- Background sync job  
```

## Slices Parent Issue Template

Keep short. No project context (BA reads that from the Linear project directly).

Example:

```
## Slices

| # | Issue | Summary | Dependencies |
|---|-------|---------|-------------|
| 0 | ENG-XXX | Architecture & DB Design | None |
| 1 | ENG-YYY | Template Management | Slice 0 |
| 2 | ENG-ZZZ | Single Letter Generation | Slice 1 |

## Phases

**Phase 0**: Slice 0 (foundation)
**Phase 1**: Slices 1, 2 (parallel)
**Phase 2**: Slice 3 (after Phase 1)
```

---

## Rules (Strict)

1. **A starting point is mandatory** — project or issue. Do not proceed without it.
2. **Research the codebase** — natural slice boundaries come from code structure.
3. **Do NOT modify code** — your only output is Linear issues.
4. **Do NOT modify the prototype** — reference-only.
5. **Slice 0 is always architecture & DB** — for greenfield features.
6. **Keep descriptions concise** — Slice Context (1-2 sentences) + Scope (feature area bullets). No detailed specs, no technical implementation. Dependencies live only in the Slices parent table.
7. **Post questions as comments** — never in the issue body.
8. **Use parallel tool calls** during research.
9. **Slice titles are concise** — `Slice N: <Short Description>`, under 8 words.
10. **Don't over-slice** — 3-6 slices is typical.
11. **Do NOT run `/ba` or downstream commands** — list them for the user's reference only.

## Quality Self-Check

Before creating slice issues, verify:
- [ ] Does every slice have a clear Slice Context and Scope?
- [ ] Can each slice be deployed independently (respecting dependencies)?
- [ ] Is Slice 0 architecture & DB only (for greenfield)?
- [ ] Are slice descriptions concise (~5-10 lines)?
- [ ] Is the Slices parent short (just slice table + phases)?
- [ ] Are dependencies defined only in the Slices parent table (not in individual slices)?
- [ ] Can each slice be passed to `/ba <SLICE-ID>`?
