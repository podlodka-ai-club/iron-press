# Orchestrator UI

Two UIs in one server:

- **Monitor** (`/`) — buildless vanilla-JS UI for watching current and past runs. Reads `.runs/` directly; doesn't touch the orchestrator process.
- **Studio** (`/studio`) — React + React Flow visual workflow builder. Reads and writes `src/workflows/<name>/workflow.json`.

## Run

```bash
cd .claude/orchestrator
pnpm ui                         # http://127.0.0.1:4455
pnpm ui --port 4500             # custom port
pnpm ui --open                  # auto-open in browser
ORCH_UI_PORT=5000 pnpm ui       # via env
ORCH_RUNS_DIR=/path/to/.runs pnpm ui   # custom runs dir
```

## Layout

```
ui/
├── server.ts         Node HTTP + router + SSE (serves both monitor and studio)
├── artifacts.ts      pure readers (tested)
├── status.ts         run/stage status derivation (tested)
├── tail.ts           fs.watchFile offset tailer (tested)
├── client/           monitor UI (vanilla JS, buildless)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── api.js
│   ├── util.js
│   └── views/
│       ├── runs.js   runs index
│       ├── run.js    run detail (stages + events + blockers)
│       └── stage.js  stage drawer (Prompt/Transcript/ToolCalls/Result/Stderr)
└── studio/           workflow builder (React + React Flow, requires build)
```

## Studio

Visual DAG editor for designing workflows. Left-to-right layout via `dagre`; smooth-step edge routing. Supports:
- Adding/removing nodes and edges
- Configuring node names, roles, models, budgets, and tool allowlists via the Inspector panel
- Undo/redo (`⌘Z` / `⌘⇧Z`)
- Persisting changes to `src/workflows/<name>/workflow.json`

## API

All JSON. Errors return `{ error: string }`.

| Path                                                | Description                                     |
|------------------------------------------------------|-------------------------------------------------|
| `GET /api/runs`                                      | runs list, newest first                         |
| `GET /api/runs/:id`                                  | run detail (meta + state + events + stages)     |
| `GET /api/runs/:id/events`                           | SSE: backlog + live event appends               |
| `GET /api/runs/:id/stages/:slug`                     | stage detail (prompt, transcript, result…)      |
| `GET /api/runs/:id/stages/:slug/stream`              | SSE: live transcript/tool-call/result           |
| `GET /api/workflows`                                 | list available workflow JSON definitions        |
| `GET /api/workflows/:name`                           | read a workflow JSON definition                 |
| `PUT /api/workflows/:name`                           | write a workflow JSON definition                |

## Typecheck + test

```bash
pnpm typecheck          # main src/
pnpm ui:typecheck       # ui/
pnpm test               # runs all vitest suites (state + node + workflow + ui)
```
