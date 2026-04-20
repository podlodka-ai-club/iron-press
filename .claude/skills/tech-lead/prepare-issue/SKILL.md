---
name: prepare-issue
description: "Prepare an Agent Implementation issue for development by creating repo issues with Technical Implementation sections. Reads the BA-created parent issue, creates one repo issue per affected repository, and writes detailed technical plans. Includes Steps 0-6.5 and Step 7 (check comments)."
---

## Your Process

Follow these steps precisely, in order.

### Step 0 — Parse Input

Determine the input type:

**Type A: From an Agent Implementation issue** — when the user provides an issue ID/URL whose title ends with `- Agent Implementation`. Use this issue directly as the parent for the rest of this process.

**Type B: From a starting issue or project** — when the user provides an issue ID/URL that is NOT an Agent Implementation issue. List its child issues via `list_issues` and find the child whose title ends with `- Agent Implementation`. Use that child as the parent. If no such child exists, inform the user the BA agent needs to run first and stop.

**If no issue is provided**, ask the user for one and wait.

### Step 1 — Read Parent Issue and Set Status

- Load the Agent Implementation issue via `get_issue`. Set status to **"Agent Working"** via `save_issue`.
- Read the full description — Context, Goal, Affected Repositories, User Scenarios, Business Rules, Acceptance Criteria, Feature Flag, Edge Cases, Out of Scope.
- Note which repositories are checked in the Affected Repositories section.

### Step 1.5 — Determine Base Branch

Determine the base branch for the repo issues by walking up the issue hierarchy:

1. Load the Agent Implementation's **parent** issue via `get_issue` using `parentId`.
2. **If the parent is a Slice** (title starts with `Slice`):
   - Load the Slice's parent (the Slices Parent) via `get_issue` using its `parentId`.
   - Base branch is the `branchName` field from the Slices Parent issue (returned by `get_issue`).
3. **If the parent is NOT a Slice** (direct flow — feature issue or project):
   - Base branch is `main`.

Store the resolved base branch for use in Step 5.

### Step 2 — Research the Codebase

For each affected repository, explore the codebase to understand existing patterns, models, services, components, and routes relevant to the feature. Use parallel tool calls where possible.

Before writing any technical plan, **always read**:
- `.claude/agents/knowledge/tech-lead.md` — accumulated codebase knowledge
- The project-specific CLAUDE.md (or AGENTS.md) for each affected repo:
  - `backend-app/CLAUDE.md` — DryService pattern, Pundit policies, testing guidelines, Rails conventions
  - `frontend-app/CLAUDE.md` — form handling, auth flow, component patterns, code conventions and patterns
- Root `CLAUDE.md` for cross-project patterns (API communication, snake_case ↔ camelCase, JWT auth)

### Step 3 — Clarifying Questions

After research, determine if you have blocking questions about scope, ownership, data relationships, or ambiguities in the BA description that would significantly affect the technical plan.

#### Formatting questions with options

When a question has a discrete set of possible answers, list them as lettered options (a, b, c, …) — each on its own line. Mark the recommended option with *(recommended)*. Only propose options when the question naturally has distinct alternatives; for open-ended questions, just ask plainly.
If your research already led you to **assume** one of the options, mark it with *(current)*.
Place the *(current)* or *(recommended)* option first (as option a).

If you have no questions, proceed to Step 4. If you do have questions, still proceed to Step 4 — you will post questions as comments after creating the repo issues.

### Step 4 — Create Sub-Issues

Create one repo issue per affected concern. Use `save_issue` with:
- `parentId`: the Agent Implementation parent issue ID
- `team`: "Engineering"
- `state`: "Todo"
- `title`: `<Project Name> - <Label>` (see labels below)

**Sub-issue labels and when to create them:**

| Label | Repo                 | When to include                                  |
|-------|----------------------|--------------------------------------------------|
| `Backend` | `backend-app/`       | API endpoints, models, services, jobs, migrations |
| `Frontend` | `frontend-app/`      | Frontend UI changes                              |

**Example titles** (if project is "Tip Payment Splits"):
- `Payment - Backend`
- `Payment - Frontend`

### Step 5 — Write Technical Implementation

For each repo issue, write the `description` with the Technical Implementation section (see "What You Produce" below).

### Step 5.5 — Feature Flag

If the parent issue specifies a feature flag is required:
- Include the flag name and usage instructions in the relevant repo issues (typically Backend for gate checks, and frontend repo issues for client-side gating).
- Use the flag name proposed by the BA. If the BA didn't propose a name, create a descriptive snake_case name.
- Specify where the gate check should be added (controller, service, component, etc.).

### Step 6 — Post Questions

**After creating all repo issues**, if you have clarifying questions from Step 3, post them as comments on the **relevant repo issues** (not the parent) following the format in `.claude/skills/_shared/questions-format.md`. Each repo issue should only receive questions relevant to that repo issue's scope.

Tell the user which repo issues have questions and that they can answer on Linear, then run `/tl-check-comments <SUB-ISSUE-ID>` for each one.

### Step 6.5 — Set Final Status on Agent Implementation Parent Issue

After completing all repo issue creation and question posting:

- **If you posted clarifying questions on ANY repo issue** → set the Agent Implementation parent issue status to **"Agent Blocked"** via `save_issue`.
- **If you have NO remaining questions on any repo issue** → set the Agent Implementation parent issue status to **"Agent Done"** via `save_issue`.

**IMPORTANT:** This status is ALWAYS set on the Agent Implementation parent issue only — NEVER change the status of repo issues you created.

---

## What You Produce

For **each repo issue**, write a **Technical Implementation** section that includes the following subsections as applicable:

### For Backend Sub-Issues (backend-app/)

1. **Database Changes**
   - Migrations needed (table names, columns, types, indexes, constraints, foreign keys)
   - Note any data backfill requirements
   - Explicitly state if NO database changes are needed

2. **Models**
   - New models or changes to existing models
   - Associations, validations, scopes, enums
   - Callbacks only when strictly necessary (prefer service objects)

3. **Service Objects**
   - Follow the DryService pattern from the project
   - List each service with its responsibility, inputs, outputs, and key logic steps
   - Error handling approach

4. **API Endpoints**
   - HTTP method, path, controller#action
   - Request params (required/optional, types)
   - Response shape (JSON structure with example)
   - Authentication/authorization requirements (Pundit policies)
   - Rate limiting or throttling considerations if applicable

5. **Background Jobs**
   - Sidekiq jobs needed, queue priority
   - Idempotency considerations

6. **Security Considerations**
   - Authorization checks (Pundit policies — new or modified)
   - Input validation and sanitization
   - Data exposure risks (ensure no over-serialization)
   - OWASP-relevant concerns (IDOR, mass assignment, injection, etc.)

7. **Tests**
   - RSpec test files to create/modify
   - Key scenarios to cover (happy path, edge cases, authorization failures)
   - Factory changes if needed

### For Frontend Sub-Issues (frontend-app/)

1. **Routes**
   - New routes or changes to existing route configuration
   - Loader/action functions needed

2. **Components**
   - New components to create (with file paths)
   - Existing components to modify
   - Component hierarchy and data flow

3. **Data Layer**
   - API calls needed (endpoint, method, request/response shape)
   - SWR hooks or mutations to create/modify
   - Optimistic updates if applicable
   - Remember: Axios handles snake_case ↔ camelCase automatically

4. **Forms & Validation**
   - Form fields, validation rules
   - Follow the app's established form handling patterns

5. **State Management**
   - Local state, URL state, or shared state needs
   - Loading/error states

6. **Security Considerations**
   - JWT token handling
   - Route protection / authorization guards
   - XSS prevention in rendered content
   - Sensitive data handling in client state

7. **UI/UX Notes**
   - Reference components other similar places
   - Toast notifications, loading indicators, error boundaries
   - Accessibility considerations

---

## Sub-Issue Output Format

For each repo issue, create via `save_issue` with the following `description`:

```markdown
## Repository

`<repo-name>/` — <what this repo is responsible for in this feature>

Base branch: `<base-branch>` (determined in Step 1.5)

## Context

Business context described in parent issue: <PARENT-ISSUE-IDENTIFIER>

## Technical Implementation

[Your structured technical plan following the subsections above]

### Feature Flag

[Flag name, where to check it, fallback behavior — only if parent issue requires one]

### Implementation Order

[If there are dependencies between repo issues, state the order]
```

---

## Rules (Strict)

1. **Do not edit the parent issue** — the parent issue is owned by the BA agent. You only create repo issues.
2. **Do not rewrite or modify the BA description** — your output is repo issues with Technical Implementation sections.
3. **Do not over-engineer** — match the complexity of the solution to the complexity of the problem.
4. **Do not skip security analysis** — even for seemingly simple features.
5. **Do not create repo issues for repos not checked in Affected Repositories** — unless you identify a missing concern (flag it as an assumption).
6. **Be specific about file paths** — explore the codebase to find existing patterns and correct directories.
7. **Include code snippets or pseudocode** when it clarifies intent (migration columns, JSON shapes, service signatures).
8. **Reference existing code** that should be used as a pattern or extended.
9. **Use parallel tool calls** during research.
10. **Questions go on repo issues as comments** — never on the parent issue, never in the description.
11. **If you must make an assumption**, state it explicitly and mark it with an assumption marker so it can be reviewed.

## Quality Self-Check

Before creating repo issues, verify:
- [ ] Have I read the project-specific CLAUDE.md for each affected repo?
- [ ] Is every repo issue scoped to exactly one repo/concern?
- [ ] Does each Technical Implementation section cover security?
- [ ] Are file paths specific and verified against the codebase?
- [ ] Are dependencies between repo issues clearly stated?
- [ ] Is the Feature Flag section included if the parent requires one?
