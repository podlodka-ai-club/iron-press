# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                                   # install dependencies (also installs git hooks via husky)
pnpm do <issueId>                              # run the default workflow on a Linear issue (e.g. ENG-534)
pnpm do <workflowName> <issueId>               # run a specific workflow
pnpm do <issueId> --cwd <path>                 # set the cwd the SDK session runs in
pnpm do <issueId> --run-id <id>                # reuse an existing .runs/<id> directory (stage counter resumes)
pnpm do <issueId> --run-id <id> --resume <nodeId>  # resume a suspended run from a specific node
pnpm do --poll                                 # poll Linear continuously for new issues to process
pnpm build                                     # compile TypeScript → dist/
pnpm typecheck                                 # type-check only (no emit)
pnpm test                                      # run all vitest suites
pnpm test:watch                                # vitest in watch mode
pnpm ui                                        # start monitoring UI (tsx ui/server.ts)
pnpm ui:typecheck                              # type-check the UI project
```

A pre-commit hook (`.husky/pre-commit`) runs `pnpm typecheck && pnpm test` before every commit and blocks it on failure.

CLI behaviour: `pnpm do` with a single arg treats it as an issue id and picks `DEFAULT_WORKFLOW` (`simple`). Two args is `<workflowName> <issueId>`. `--resume <nodeId>` requires `--run-id` and resumes from the named node using saved state.

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
- `GraphologyEngine<TState>` — concrete `Engine` implementation; accepts `EngineHooks` and `EngineOptions` (`maxVisitsPerNode`, default 100). Exposes `.run()` and `.resume(workflow, startNodeId, initialState)` for resuming suspended runs.
- `WorkflowError` — typed error with `kind`: `"MISSING_INITIAL_NODE" | "VISIT_LIMIT_EXCEEDED" | "VALIDATION_FAILED"`
- `WORKFLOWS`, `DEFAULT_WORKFLOW`, `getWorkflow`, `availableWorkflowNames` — workflow registry (includes dynamic JSON-based workflows discovered by `discoverDynamicWorkflows()`)

### Agent nodes (`src/sdk/node/`)

`AgentNode<TState>` is the base class every LLM-backed node extends. It owns the full SDK session lifecycle:

1. Open a stage directory via `RunLog.openStage({ kind, issueId })`.
2. Derive a deterministic UUIDv5 session id from `(runId, role, issueId, stageIndex)` so `--run-id` re-derives stable ids.
3. Run one `query()` with **structured output** locked to `{ status: "Pass"|"Fail"|"WaitUserInput" }` via `outputSchema`. The SDK enforces the shape and retries internally on violations.
4. Write `prompt.md`, `transcript.jsonl`, `tool-calls.jsonl`, `stderr.log`, and `result.json` into the stage directory.
5. Return the parsed status.

Concrete nodes pass a hard-coded `AgentNodeConfig` to the super constructor — they don't override `execute`.

**`AgentNode.fromMd(url, runLog, cwd)`** — factory that reads a markdown file, parses its YAML frontmatter (`id`, `name`, `role`, `model`, `maxTurns`, `budgetUsd`, `allowedTools`, `disallowedTools`, `permissions`), and uses the body as the prompt template. This is the preferred pattern for new LLM-backed nodes.

**Deterministic nodes** (no SDK session) also live in `src/sdk/node/`:
- `CreateBranchNode<TState>` — runs `git checkout -b <branch>` and pushes to origin; reads branch name and base from `WorkflowConfig`.
- `PullRequestNode<TState>` — creates a GitHub PR via `GithubClient`; reads title, body, and branch from state.

### Node definition patterns

**Preferred — markdown-driven (used by `simple` workflow):**

```
src/workflows/<workflow>/
├── <node-id>.md    — YAML frontmatter + prompt body
└── config.ts       — WorkflowConfig (cwd, baseBranch, branchPrefix, …)
```

The frontmatter in `<node-id>.md` carries all config: `id`, `name`, `role`, `model`, `maxTurns`, `budgetUsd`, `allowedTools`, `disallowedTools`, `permissions`. The body is the prompt template (supports `{{issueId}}` substitution). Loaded via `AgentNode.fromMd(new URL("node.md", import.meta.url), runLog, cwd)`.

**Legacy — class-per-node (used by `sm` and `simple-json` workflows):**

```
src/workflows/<workflow>/nodes/<node>/
├── index.ts        — class extending AgentNode; imports permissions + skill.md
├── skill.md        — user prompt template
└── permissions.ts  — allowedTools, disallowedTools, canUseTool guard
```

Permissions are **per-node** in both patterns — they ship next to the node they protect.

### Workflow definition (`src/workflows/<name>/workflow.ts`)

A workflow is a `WorkflowFactory`: `(runLog, cwd) => Workflow<State>`. The `simple` workflow example (`src/workflows/simple/workflow.ts`):

```ts
new WorkflowBuilder<SimpleWorkflowState>()
  .addNode(AgentNode.fromMd(new URL("clarification.md", import.meta.url), runLog, cwd))
  .addNode(new CreateBranchNode(runLog, cwd, config))
  .addNode(AgentNode.fromMd(new URL("implementation.md", import.meta.url), runLog, cwd))
  .addNode(new PullRequestNode(runLog, cwd, config))
  .addEdge("ba", "create-branch", "Pass")
  .addEdge("create-branch", "eng", "Pass")
  .addEdge("eng", "pull-request", "Pass")
  .setInitialNode("ba")
  .build();
```

Register the factory in `src/sdk/workflow/registry.ts` (`WORKFLOWS`) to make it runnable via `pnpm do <name> <issueId>`. Workflows can also be defined as `workflow.json` files — these are discovered automatically by `discoverDynamicWorkflows()` and do not require manual registration.

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

JSON config (`iron-press.config.json`) is validated against `AppConfigSchema` (`src/config/app-config-schema.ts`). Top-level fields:

| Field | Type | Description |
|-------|------|-------------|
| `defaultWorkflow` | `string` | Workflow used when no label matches; overrides the `DEFAULT_WORKFLOW` constant (`"simple"`). |
| `workflowMapping` | `Record<string, string>` | Maps Linear label names to workflow names. In poll mode the first matching label wins; if the mapped workflow is not registered a warning is logged and the next label is tried. Falls back to `defaultWorkflow` (or the constant) when no label matches. |
| `linear` | object | Polling settings: `teamId`, `projectId`, `pollIntervalMs`, `pollLookbackMs`, `includeStatuses`, `excludeStatuses`. |
| `repository` | object | Auto-clone settings: `url`, `cloneDir`, `baseBranch` (default `"main"`), `branchPrefix` (default `"issue-"`). |

Example:
```json
{
  "defaultWorkflow": "simple",
  "workflowMapping": {
    "feature": "simple",
    "bug": "sm"
  },
  "linear": { "teamId": "YOUR_TEAM_ID" },
  "repository": { "url": "git@github.com:owner/repo.git" }
}
```

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

### Studio UI (`ui/studio/`)

A visual workflow builder and runtime monitor built with React and React Flow (`@xyflow/react`).

- **Layout:** Directed Acyclic Graph (DAG) using `dagre` (Left-to-Right routing). Edges use smooth step orthogonal routing.
- **Node Configuration:** The `Inspector` provides a UI for defining node names, roles, models, budgets, and an interactive chip-based multiselect for tools.
- **Storage:** Reads and writes workflows directly as JSON definition files to `src/workflows/<name>/workflow.json`.
- **State:** Uses `zustand` for local graph state and features a custom `past`/`future` undo-redo history stack bound to `⌘Z` and `⌘⇧Z`.
- **Backend:** `ui/server.ts` serves the pre-built React frontend and provides API routes for reading/writing `workflow.json` files and proxying SSE run logs.

### Github client (`src/github/`)

`GithubClient` wraps Octokit for issue and PR reads. Paginated, handles comment truncation and null-safety edge cases. Use this rather than calling `@octokit/rest` directly.

### TypeScript conventions

- Path alias: `@/*` → `src/*` (see `tsconfig.json`). Prefer `@/sdk/workflow` over relative chains like `../../sdk/workflow`.
- `strict`, `noUncheckedIndexedAccess`, `isolatedModules` are all on. Array/record access may be `undefined` — check before use.
- All schemas use Zod strict validation.
- Node 22+ required (`engines.node`).

## Testing

All suites pass (`pnpm test`):
- `tests/state/classify.test.ts` — title/label regex classifiers (`src/state/classify.ts`).
- `tests/sdk/workflow/engine.test.ts` — workflow engine edge-matching and suspend/resume logic.
- `tests/sdk/node/agent-node.test.ts` — `AgentNode` lifecycle, `fromMd` factory, prompt building.
- `tests/sdk/node/create-branch-node.test.ts` — `CreateBranchNode` git checkout behavior.
- `tests/sdk/node/pull-request-node.test.ts` — `PullRequestNode` GitHub PR creation.
- `tests/ui/status.test.ts`, `tests/ui/artifacts.test.ts`, `tests/ui/tail.test.ts` — UI-layer helpers in `ui/`.

When changing the workflow engine or `AgentNode`, write tests against `src/sdk/workflow/` and `src/sdk/node/`. Every branch of the engine's edge-matching logic should have a positive and negative case.
