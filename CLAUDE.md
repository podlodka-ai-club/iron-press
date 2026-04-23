# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                                   # install dependencies
pnpm do <issueId>                              # run the default workflow on a Linear issue (e.g. ENG-534)
pnpm do <workflowName> <issueId>               # run a specific workflow
pnpm do <issueId> --cwd <path>                 # set the cwd the SDK session runs in
pnpm do <issueId> --run-id <id>                # reuse an existing .runs/<id> directory (stage counter resumes)
pnpm build                                     # compile TypeScript → dist/
pnpm typecheck                                 # type-check only (no emit)
pnpm test                                      # run all vitest suites
pnpm test:watch                                # vitest in watch mode
pnpm ui                                        # start monitoring UI (tsx ui/server.ts)
pnpm ui:typecheck                              # type-check the UI project
```

CLI behaviour: `pnpm do` with a single arg treats it as an issue id and picks `DEFAULT_WORKFLOW` (`simple`). Two args is `<workflowName> <issueId>`.

## Architecture

iron-press drives a Claude Agent SDK pipeline as a **directed graph of nodes**. Control flow is a Graphology workflow; each node is one headless SDK session. There is no central dispatcher — the engine walks edges based on each node's returned `NodeStatus`.

### Entry point (`src/index.ts`)

```
parse CLI → assertConfig() → createRunLog() → getWorkflow(name) → GraphologyEngine.run()
```

Exit code mirrors the terminal status:

| Code | Meaning |
|------|---------|
| 0 | `Pass` — workflow reached a node with no matching outgoing edge |
| 1 | `Fail` — a node returned `Fail`, or the run errored |
| 2 | `WaitUserInput` — a node suspended pending human input (resumable via `--run-id`) |

### Workflow engine (`src/sdk/workflow/`)

Graphology-backed engine for modelling control flow as a directed graph.

**Core concepts:**
- **`Node<TState>`** — processing step with `id`, `name`, `onEnter?`, `execute`, `onExit?` lifecycle hooks.
- **`NodeStatus`** — fixed output vocabulary: `"Pass" | "Fail" | "WaitUserInput"`.
- **Edges** — directed, labeled with the status(es) that trigger them.

**Execution model:** engine calls `node.onEnter` → `node.execute` (returns `{ status }`) → `node.onExit`, then follows the matching outgoing edge. `WaitUserInput` suspends immediately (no edge lookup). Run ends when no outgoing edge matches the last status (natural end) or `WaitUserInput` is returned.

**Key exports** from `src/sdk/workflow/index.ts`:
- `Node<TState>` / `NodeContext<TState>` — interfaces for implementing nodes
- `WorkflowBuilder<TState>` — fluent builder: `addNode` → `addEdge` → `setInitialNode` → `build()`
- `GraphologyEngine<TState>` — concrete `Engine` implementation; accepts `EngineHooks` and `EngineOptions` (`maxVisitsPerNode`, default 100)
- `WorkflowError` — typed error with `kind`: `"MISSING_INITIAL_NODE" | "VISIT_LIMIT_EXCEEDED" | "VALIDATION_FAILED"`
- `WORKFLOWS`, `DEFAULT_WORKFLOW`, `getWorkflow`, `availableWorkflowNames` — workflow registry

### Agent nodes (`src/sdk/node/`)

`AgentNode<TState>` is the base class every LLM-backed node extends. It owns the full SDK session lifecycle:

1. Open a stage directory via `RunLog.openStage({ kind, issueId })`.
2. Derive a deterministic UUIDv5 session id from `(runId, role, issueId, stageIndex)` so `--run-id` re-derives stable ids.
3. Run one `query()` with **structured output** locked to `{ status: "Pass"|"Fail"|"WaitUserInput" }` via `outputSchema`. The SDK enforces the shape and retries internally on violations.
4. Write `prompt.md`, `transcript.jsonl`, `tool-calls.jsonl`, `stderr.log`, and `result.json` into the stage directory.
5. Return the parsed status.

Concrete nodes pass a hard-coded `AgentNodeConfig` to the super constructor — they don't override `execute`.

### Node folder convention

Each node lives in its own directory with three files:

```
src/workflows/<workflow>/nodes/<node>/
├── index.ts        — class extending AgentNode; imports permissions + skill.md
├── skill.md        — user prompt template (supports {{issueId}} substitution)
└── permissions.ts  — allowedTools, disallowedTools, canUseTool guard
```

`skill.md` is loaded at module init via `loadSkill(import.meta.url, "skill.md")`. Permissions are **per-node**, not global — they ship next to the node they protect.

### Workflow definition (`src/workflows/<name>/workflow.ts`)

A workflow is a `WorkflowFactory`: `(runLog, cwd) => Workflow<State>`. Example (`src/workflows/simple/workflow.ts`):

```ts
new WorkflowBuilder<SimpleWorkflowState>()
  .addNode(new BaNode(runLog, cwd))
  .addNode(new EngNode(runLog, cwd))
  .addEdge("ba", "eng", "Pass")
  .setInitialNode("ba")
  .build();
```

Register the factory in `src/sdk/workflow/registry.ts` (`WORKFLOWS`) to make it runnable via `pnpm do <name> <issueId>`.

### SDK session (`src/sdk/session/`)

- `runner.ts` — `runSession()` is the generic `@anthropic-ai/claude-agent-sdk` `query()` wrapper. Streams transcript JSONL and stderr to caller-supplied paths, returns the final `result` message or `null` on throw. `permissionMode: "bypassPermissions"` — gating is done via `canUseTool` and allow/deny lists, not prompts. `settingSources: ["user", "project", "local"]` so `.claude/` configs load.
- `session.ts` — `stableSessionId(role, issueId, runId, stageIndex)` is UUIDv5 over a fixed namespace. The stage index is included because the SDK refuses to reuse session ids and the same `(role, issueId)` pair can be dispatched multiple times per run.

### Configuration (`src/config.ts`)

Reads `.env` from the orchestrator root (same dir as `package.json`). Key vars:
- `LINEAR_API_KEY` — required unless `DEV_MODE=1`.
- `ANTHROPIC_API_KEY` — optional; the SDK reuses Claude Code OAuth if omitted.
- `GITHUB_TOKEN`, `MAX_RUN_USD`, `WORKSPACE_ROOT` — optional.
- `config.sensitiveKeywords` — strings (pricing, legal, auth, billing, …) that block auto-PO even in lead mode.

`config.workspaceRoot` defaults to `../..` relative to the orchestrator root (assumes the package sits at `.claude/orchestrator/`).

### Run artifacts (`src/runs/run-log.ts`)

Every run writes to `.runs/<runId>/`:

```
.runs/<runId>/
├── events.ndjson                          append-only event log (run_started, run_finished, …)
├── state.json                             last PipelineState snapshot (when written)
├── meta.json                              run metadata
└── stages/NNNN-<role>-<issue>/            one directory per SDK session
    ├── prompt.md
    ├── transcript.jsonl
    ├── tool-calls.jsonl
    ├── stderr.log
    └── result.json                        { status, sessionId, costUsd, tokens }
```

Run id format: `YYYYMMDD-HHmmss-<rand>` (local time) so `ls` sorts chronologically.

### Github client (`src/github/`)

`GithubClient` wraps Octokit for issue and PR reads. Paginated, handles comment truncation and null-safety edge cases. Use this rather than calling `@octokit/rest` directly.

### TypeScript conventions

- Path alias: `@/*` → `src/*` (see `tsconfig.json`). Prefer `@/sdk/workflow` over relative chains like `../../sdk/workflow`.
- `strict`, `noUncheckedIndexedAccess`, `isolatedModules` are all on. Array/record access may be `undefined` — check before use.
- All schemas use Zod strict validation.
- Node 22+ required (`engines.node`).

## Known issues

**`tests/planner/` and `tests/workflow/` are currently broken** — they import `src/planner/decide.js` and `src/workflow/index.js`, both removed in the `nodes`-branch rewrite. `pnpm test` reports them as failed suites with 0 tests collected. The other suites (`tests/state/classify.test.ts`, `tests/ui/*`) still pass. Either port these to the new paths (`src/sdk/workflow/`) or delete them before relying on a green `pnpm test`.

## Testing

Passing suites today:
- `tests/state/classify.test.ts` — title/label regex classifiers (still live in `src/state/classify.ts`).
- `tests/ui/status.test.ts`, `tests/ui/artifacts.test.ts`, `tests/ui/tail.test.ts` — UI-layer helpers in `ui/`.

When changing the workflow engine or `AgentNode`, write tests against the new `src/sdk/workflow/` paths. Every branch of the engine's edge-matching logic should have a positive and negative case.
