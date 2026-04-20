# Orchestrator

Production-grade TypeScript driver for the agent pipeline. Replaces the Claude Code `/pm`-based dispatch loop with deterministic planning + headless Claude Agent SDK stages.

## What it does

Given a Linear issue or project ID, walks the pipeline to completion (PRs opened) or to a deterministic blocked-on-human state:

```
Project → BA → PO → TL → Code (parallel Rails + React PRs)
```

Each LLM role (BA, PO, TL, Rails dev, React dev) runs as a headless `@anthropic-ai/claude-agent-sdk` session that loads the existing `.claude/skills/**/SKILL.md` instructions verbatim — zero behavioural drift from the interactive Claude Code flow.

The dispatch step is **deterministic TypeScript**, not an LLM. That fixes the "sometimes doesn't execute the next command" bug that plagues the interactive pipeline.

## Install

```bash
cd .claude/orchestrator
pnpm install
cp .env.example .env
# fill in LINEAR_API_KEY
```

### Anthropic auth

`ANTHROPIC_API_KEY` is **optional**. If you're logged in to Claude Code
(`claude login`), the Agent SDK reuses those OAuth credentials and bills
against your Pro/Max/Team subscription. Set the key only when you want
pay-as-you-go API credits instead.

Verify you're logged in with `claude /status` — if it shows an account, you're
set.

## Run

```bash
pnpm orchestrate ENG-534
pnpm orchestrate https://linear.app/team/project/my-feature-abc123
pnpm orchestrate ENG-534 --lead=po                   # auto-answer BA questions via PO
pnpm orchestrate ENG-534 --ba=slice --design=brainstorm
pnpm orchestrate ENG-534 --dry-run                   # plan only, no SDK calls
pnpm orchestrate --resume abc123                     # resume a prior run
```

See `pnpm orchestrate --help` for the full flag list.

## Layout

```
src/
├── index.ts               CLI entry
├── orchestrator.ts        Main loop (fetch → decide → dispatch)
├── config.ts              Env + workspace root + per-role budgets
├── types/contracts.ts     Zod schemas (Flags, Issue, Action, StageResult, …)
├── state/                 Linear client + tree walk + classifier (deterministic)
├── planner/               Decision rules (ports drive-project/SKILL.md)
├── stages/                Per-role SDK session specs (BA, PO, TL, …)
├── stages/code/           Worktree prep + parallel dev dispatch + cleanup
├── sdk/                   query() wrapper, permission guards, hooks, skill loader
├── runs/                  Run log (NDJSON), artifacts, blockers report
└── util/                  Logger, retry, JSON extraction
```

## Exit codes

| Code | Meaning                                                                 |
|------|-------------------------------------------------------------------------|
| 0    | Pipeline complete OR ran to a blocked-on-human state (see Blockers)     |
| 1    | Unrecoverable error (auth, config, persistent SDK failure)              |
| 2    | Budget cap exceeded                                                     |
| 130  | SIGINT (state checkpointed; resumable via `--resume <runId>`)           |

## Run artifacts

Every run writes to `.runs/<runId>/`:

```
.runs/<runId>/
├── state.json                  Last PipelineState snapshot
├── events.ndjson               Append-only event log
├── cost.json                   Running totals (USD, tokens)
├── blockers.json               Written on blocked exit
└── stages/NNNN-<role>-<issue>/ Per-stage prompt, transcript, result, stderr
```

## Tests

```bash
pnpm test
```

Planner rules are covered by fixture-driven unit tests — every branch in the decision tables from `drive-project/SKILL.md` has at least one positive and one negative fixture.
