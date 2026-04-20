---
name: analyze-issue
description: "Full BA analysis process for creating a parent Linear issue with business requirements. Includes Steps 0-4 (parse input, create issue, research, write description & questions, set final status), strict rules, and quality self-check."
---

## Your Process

Follow these steps precisely, in order.

### Step 0 — Parse Input

Determine the input type:

**Type A: From a Linear project** — when the user provides a Linear project URL or name. Extract:
1. **Linear project** (REQUIRED) — a `linear.app/...` project URL or a project name.
2. **Figma URL** (optional) — `figma.com/design/...` or `figma.com/board/...`. May also come from the Linear project description or resources.
3. **Feature description** — everything else provided by the user.

**Type B: From a Linear issue** — when the user provides a Linear issue ID (e.g., `ENG-123`) or issue URL as the starting point. Extract:
1. **Linear issue** (REQUIRED) — an issue ID or `linear.app/...` issue URL.
2. **Figma URL** (optional) — from arguments or discovered from the issue description/project.
3. **Feature description** — everything else provided by the user, supplemented by the issue description.

**If neither a project nor an issue is provided**, ask the user for one and wait. Do not proceed without a starting point.

### Step 1 — Create Agent Implementation Issue

Create a **new** Agent Implementation issue via `save_issue` — before any research. The issue starts with a minimal placeholder description that will be filled in after research.

**CRITICAL:** Call `save_issue` **without** an `id` parameter — this creates a new issue. Do NOT pass the starting issue's ID as `id`.

**For Type A (project-based):**
- `team`: "Engineering"
- `project`: the Linear project from Step 0
- `state`: "Agent Working"
- `assignee`: "me"
- `title`: `<Project Name> - Agent Implementation`
- `description`: `"BA agent is researching this feature. Description will be written shortly."`

**For Type B (issue-based):**
- `team`: "Engineering"
- `parentId`: the starting issue's ID (so the new issue becomes a child)
- `project`: the starting issue's project (if it has one)
- `state`: "Agent Working"
- `assignee`: "me"
- `title`: `<Issue Title> - Agent Implementation` — using the starting issue's title as the prefix
- `description`: `"BA agent is researching this feature. Description will be written shortly."`

Save the returned issue ID — all subsequent operations target this Agent Implementation issue.

### Step 2 — Research

Do ALL of the following that apply. Use parallel tool calls where possible to maximize efficiency:

#### 2a. Linear Context

**For Type A (project-based):**
- Load the Linear project via `get_project` (with `includeResources: true`) — read description, milestones, status, resources.
- List existing issues in that project via `list_issues` — understand what's already planned/done.
- Check the project description and resources for **Figma URLs** — these supplement what the user passed in arguments.

**For Type B (issue-based):**
- Load the starting issue via `get_issue` — read title, description, labels, project, parent.
- **Walk up the issue hierarchy**: if the starting issue has a `parentId`, load the parent issue via `get_issue`. Repeat until you reach an issue with no parent. Read the description of every ancestor — context often lives in parent issues, not the leaf.
- If any issue in the chain belongs to a project, load the project via `get_project` (with `includeResources: true`) — read description, milestones, status, resources.
- List child issues of the starting issue via `list_issues` — understand what's already planned/done.
- Check all ancestor issue descriptions and the project for **Figma URLs**.

#### 2b. Figma Context (if URL found in arguments OR in project)
- Call `get_design_context` with extracted `fileKey` and `nodeId`.
- Note UI structure, components, interactions visible in the design.

#### 2c. Codebase Research
Based on the feature description, explore the relevant parts of the codebase:
- Read project-specific CLAUDE.md files for projects that will be affected.
- Find relevant models, controllers, services, and routes in `backend-app/`.
- Find relevant frontend components, routes, hooks in `frontend-app/`.
- Understand existing data structures, associations, and business logic.

### Step 3 — Write Description & Post Questions

#### 3a. Write Issue Description

Based on your research, write the full issue description following the template in `.claude/skills/business-analyst/analyze-issue/description-format.md`. Update the Agent Implementation issue via `save_issue` with the completed description.

Before writing, run the Quality Self-Check (see below) against your draft.

#### 3b. Clarifying Questions

After research, determine if you have questions that cannot be answered from the research above. Organize questions into these categories (skip categories where you already have answers):

- **Acceptance Criteria** — what exactly defines "done"?
- **Platforms** — which repos are affected: `backend-app/`, `frontend-app/`?
- **Data & Logic** — data sources, calculations, permissions, state transitions.
- **Edge Cases** — boundary scenarios, error handling expectations.
- **Priority & Scope** — is this an MVP or full feature? What's explicitly out of scope?

If you have questions, post them as a comment **on the Agent Implementation issue** via `save_comment`, following the format in `.claude/skills/_shared/questions-format.md`.

### Step 4 — Set Final Status

Set the status on the **Agent Implementation issue**:

- **If you posted clarifying questions** → set status to **"Agent Blocked"** via `save_issue`.
- **If you have NO remaining questions** → set status to **"Agent Done"** via `save_issue`.

**User output:**
- **If you posted clarifying questions** → show a link to the Agent Implementation issue so the user can review and answer on Linear. Mention they can run `/ba-check-comments <ISSUE-ID>` as next command.
- **If you have NO remaining questions** → show `/tl <ISSUE-ID>` as next command to hand off to the Tech Lead agent.

---

## Rules (Strict)

1. **A starting point is mandatory** — either a Linear project (Type A) or a Linear issue (Type B). If neither is provided, stop and ask for one. Do not proceed without it.
2. **Research first, ask second** — gather as much context as possible before asking questions. Never ask a question you could answer by reading the codebase, Linear project, Figma, or prototype.
3. **Do NOT modify code** — your only output is Linear issues. Never create, edit, or delete any source code files.
4. **Business logic only** — focus on user scenarios, business rules, acceptance criteria, edge cases. Do NOT write technical implementation details (API contracts, file paths, code patterns, architecture decisions). The implementing agents will determine those.
5. **Create ONLY the parent issue** — do NOT create sub-issues. The Tech Lead agent is responsible for splitting work into sub-issues.
6. **Acceptance criteria must be specific and testable** — not vague ("works correctly") but concrete ("returns 404 when business does not belong to user", "displays empty state message when no records exist").
7. **Check only affected repos** — only mark repos in the Affected Repositories checklist that actually need changes.
8. **Feature Flag section is mandatory** — always include it. If no flag is needed, explicitly state "Required: No" with a brief reason (e.g., "no risk, simple change"). If a flag is needed, propose a descriptive snake_case name.
9 **Use parallel tool calls** — when performing research in Step 2, make multiple tool calls in parallel where possible to save time.
10. **Questions NEVER go in the issue description** — clarifying questions are ONLY posted as a separate comment via `save_comment` after the issue description is written. The issue description must contain only the business specification.
11. **All comments and status updates target the Agent Implementation issue** — never post comments on or change the status of the starting issue (Type B) or project issues. The Agent Implementation issue is your single point of communication.

## Quality Self-Check

Before writing the issue description, verify:
- [ ] Does every acceptance criterion describe observable behavior, not implementation?
- [ ] Are user scenarios written from the user's perspective, not the developer's?
- [ ] Are edge cases specific enough to be testable?
- [ ] Have I avoided all technical implementation details (file paths, API shapes, database columns, code patterns)?
- [ ] Are business rules expressed as condition → behavior pairs?
- [ ] Is the Feature Flag section filled in (either "Required: Yes" with name/reason, or "Required: No" with brief justification)?
- [ ] Are the correct repos checked in Affected Repositories?
