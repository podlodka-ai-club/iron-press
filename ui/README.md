# Orchestrator UI

A buildless web UI for monitoring current and past orchestrator runs. Reads `.runs/` directly; doesn't touch the orchestrator process.

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
├── server.ts         Node HTTP + router + SSE
├── artifacts.ts      pure readers (tested)
├── status.ts         run/stage status derivation (tested)
├── tail.ts           fs.watchFile offset tailer (tested)
└── client/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── api.js
    ├── util.js
    └── views/
        ├── runs.js   runs index
        ├── run.js    run detail (stages + events + blockers)
        └── stage.js  stage drawer (Prompt/Transcript/ToolCalls/Result/Stderr)
```

## API

All JSON. Errors return `{ error: string }`.

| Path                                                | Description                                     |
|------------------------------------------------------|-------------------------------------------------|
| `GET /api/runs`                                      | runs list, newest first                         |
| `GET /api/runs/:id`                                  | run detail (meta + state + events + stages)     |
| `GET /api/runs/:id/events`                           | SSE: backlog + live event appends               |
| `GET /api/runs/:id/stages/:slug`                     | stage detail (prompt, transcript, result…)      |
| `GET /api/runs/:id/stages/:slug/stream`              | SSE: live transcript/tool-call/result           |

## Typecheck + test

```bash
pnpm typecheck          # main src/
pnpm ui:typecheck       # ui/
pnpm test               # runs all vitest suites (planner + state + ui)
```
