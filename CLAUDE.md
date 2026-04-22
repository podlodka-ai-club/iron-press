# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                              # install dependencies
pnpm orchestrate ENG-534                  # run pipeline on a Linear issue
pnpm orchestrate --resume <runId>         # resume a prior run
pnpm orchestrate ENG-534 --dry-run        # plan only, no SDK calls
pnpm orchestrate --help                   # full flag list
pnpm ui                                   # start monitoring UI at http://127.0.0.1:4455
pnpm build                                # compile TypeScript
pnpm typecheck                            # type check only
pnpm test                                 # run all tests
pnpm test --reporter=verbose              # verbose test output
pnpm vitest run tests/planner/decide.test.ts   # run a single test file
```

## Architecture

iron-press is a deterministic TypeScript driver for the agent pipeline. The dispatch loop is **pure TypeScript rules** (not an LLM), which fixes the "sometimes doesn't execute next command" bug.

Pipeline flow: `Project → BA → PO → TL → Code (parallel Rails + React PRs)`

Each role runs as a headless `@anthropic-ai/claude-agent-sdk` session loading `.claude/skills/**/SKILL.md` verbatim — zero behavioural drift from interactive Claude Code.

### Core loop (`src/orchestrator.ts`)

```
fetchPipelineState() → decide() → dispatchActions() → track cost → check budget
```

Max 50 iterations. Exit codes: 0 (done/blocked), 1 (error), 2 (budget exceeded), 130 (SIGINT/resumable).

### Planner (`src/planner/decide.ts`)

BFS tree walk over Linear issues. Classification is title-regex based (`src/state/classify.ts`):
- `" - Agent Implementation"` → AgentImplementation
- `" - Slices"` → SlicesParent
- `^Slice \d+:` → Slice
- `" - Backend|Frontend"` → RepoIssue

Decision priority: check-comments > code > tl-design > po > ba/ba-slice.

**Slice 0 design flow**: suffix markers drive progress — `" - Empty"` → tl-design → `" - Brainstorm"` → tl-design-finalize.

**Question FSM**: When a stage posts `## Questions from X`, the issue transitions to Agent Blocked. Next iteration: if human replied → check-comments; otherwise stay blocked.

### SDK integration (`src/sdk/session.ts`)

Session IDs are UUIDv5 (deterministic from `runId::role::issueId::stageIndex`) so `--resume` re-derives the same IDs without duplicating work.

Tool permissions are role-based: BA/PO/TL are read-only (Read/Grep/Glob/Linear MCP only); dev roles can Edit/Write/Bash within their worktree.

### Stage result contract

Every stage **must** emit a fenced JSON block at the end of its response:

```json
{
  "status": "done" | "blocked" | "failed",
  "issueIdsCreated": ["ENG-XXX"],
  "issueIdsUpdated": ["ENG-XXX"],
  "questionsPosted": boolean,
  "blockers": ["human-readable blocker"],
  "summary": "short summary"
}
```

Extracted via regex (last fenced block), validated against Zod schema (`src/types/contracts.ts`). Missing/invalid result → stage marked failed.

### Code stage (`src/stages/code/`)

Three sub-steps: **prepare** (fetch issues, create git worktrees, copy secrets) → **dispatch** (parallel dev agent per WorkUnit, each in own worktree cwd) → **cleanup** (remove worktrees, keep branches).

Branch naming: `${githubUsername}/${branchName}` from git config. Secrets are only copied for Backend via `copy-secrets.sh`.

### Run artifacts

Every run writes to `.runs/<runId>/`:
- `events.ndjson` — append-only event log
- `state.json` — last PipelineState snapshot
- `cost.json` — running totals
- `blockers.json` — written on blocked exit
- `stages/NNNN-<role>-<issue>/` — prompt, transcript, result, stderr per stage

### Configuration (`src/config.ts`)

Reads `.env` from project root. Key vars: `LINEAR_API_KEY` (required), `ANTHROPIC_API_KEY` (optional — reuses Claude Code OAuth if omitted), `MAX_RUN_USD`, `WORKSPACE_ROOT`.

Per-role budgets (model, maxTurns, budgetUsd) defined in `config.ts`. Dev agents: claude-opus-4-7, 150 turns, $12. BA/TL-design: 60 turns, ~$4–6.

### Workflow engine (`src/workflow/`)

A generic, Graphology-backed workflow engine for modelling control flow as a directed graph.

**Core concepts:**
- **`Node`** — processing step with `id`, `name`, `onEnter?`, `execute`, `onExit?` lifecycle hooks.
- **`NodeStatus`** — fixed output vocabulary: `"Pass"` | `"Fail"` | `"WaitUserInput"`.
- **Edges** — directed, labeled with the status(es) that trigger them.

**Execution model:** engine calls `node.onEnter` → `node.execute` (returns a `NodeStatus`) → `node.onExit`, then follows the matching outgoing edge. `WaitUserInput` suspends immediately (no edge lookup). Run ends when no matching edge exists or `WaitUserInput` is returned.

**Key exports** from `src/workflow/index.ts`:
- `Node<TState>` / `NodeContext<TState>` — interfaces for implementing nodes
- `WorkflowBuilder<TState>` — fluent builder: `addNode` → `addEdge` → `setInitialNode` → `build()`
- `GraphologyEngine<TState>` — concrete `Engine` implementation; accepts `EngineHooks` and `EngineOptions` (`maxVisitsPerNode`)
- `WorkflowError` — typed error with `kind`: `"MISSING_INITIAL_NODE"` | `"VISIT_LIMIT_EXCEEDED"` | `"VALIDATION_FAILED"`

### Testing

Planner tests are fixture-driven — every branch in the decision table has at least one positive and one negative fixture in `tests/planner/fixtures.ts`. When changing `src/planner/decide.ts` or `src/state/classify.ts`, update or add fixtures there.

Workflow engine tests live in `tests/workflow/engine.test.ts` and cover: linear chains, branching, `WaitUserInput` suspension, state mutation, node/engine hooks, history recording, cycle detection, and builder validation errors.

All schemas use Zod strict validation. TypeScript is configured with strict mode.
