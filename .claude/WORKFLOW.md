# Agentic Pipeline

Automated multi-agent pipeline: feature spec → architecture → code → PRs. Your role: run `/pm`, answer questions on Linear, review PRs.

## Quick Start

```
/pm <ID>                                    # Direct flow (default)
/pm <ID> --ba=slice                         # Slice into increments first
/pm <ID> --ba=slice --design=brainstorm     # Slice + brainstorm architecture
```

Re-run `/pm <ID>` any time to advance. The PM reads current state and dispatches the right commands.

## Pipeline

```
Direct:   /pm  →  /ba  →  /po  →  /ba-check-comments  →  /tl  →  /code  →  PRs

Sliced:   /pm  →  /ba-slice-issue  →  per slice:
Slice 0:  /tl-design  →  /ba  →  /po  →  /ba-check-comments  →  /tl  →  /code  →  PRs
Slice N:  /ba  →  /po  →  /ba-check-comments  →  /tl  →  /code  →  PRs
```

## Commands

| Command | What it does |
|---------|--------------|
| `/pm <ID> [flags]` | Orchestrate — classify state, dispatch next commands |
| `/ba <ID>` | Write business spec → Agent Implementation issue |
| `/ba-slice-issue <ID> [--design=brainstorm]` | Break large feature into ordered slices |
| `/po <ID>` | PO reviews Agent Implementation, answers BA questions |
| `/ba-check-comments <ID>` | Process answers on blocked BA issue |
| `/tl <ID>` | Create repo issues with technical specs |
| `/tl-design <ID>` | Direct architecture design for Slice 0 (single best solution) |
| `/tl-design-brainstorm <ID>` | Brainstorm architecture (two approaches, questions, discussion) |
| `/tl-design-finalize <ID>` | Converge brainstorm into final architecture |
| `/tl-check-comments <ID>` | Process answers on blocked TL issue |
| `/code <ID>` | Create worktrees, implement, create PRs |

**PM flags:**
- `--ba=analyze` (default) — single Agent Implementation
- `--ba=slice` — break into slices first
- `--design=direct` (default) — TL picks the best architecture
- `--design=brainstorm` — TL proposes two approaches for discussion

## Issue Hierarchy

**Direct flow:**
```
Issue/Project
  └─ Feature - Agent Implementation               ← /ba
       ├─ Feature - Backend                       ← /tl
       ├─ Feature - Frontend                      ← /tl
```

**Sliced flow:**
```
Issue/Project
  └─ Feature - Slices                             ← /ba-slice-issue
       ├─ Slice 0: Architecture & DB Design       ← /tl-design
       │    └─ ... - Agent Implementation         ← /ba (after design done)
       │         └─ ... - Backend                 ← /tl
       ├─ Slice 1: Feature Part
       │    └─ ... - Agent Implementation         ← /ba
       │         ├─ ... - Backend                 ← /tl
       │         └─ ... - Frontend                ← /tl
       └─ Slice N: ...
```

## Slice 0 Title States

| Title suffix | Meaning |
|---|---|
| `- Empty` | Placeholder — needs `/tl-design` or `/tl-design-brainstorm` |
| `- Brainstorm` | Brainstorm in progress — answer questions, then `/tl-design-finalize` |
| *(no suffix)* | Design complete — proceeds to standard BA → TL → Code flow |

## Status Lifecycle

| Issue Type | Flow |
|---|---|
| Agent Implementation | Todo → Agent Working → Agent Blocked ⇄ Agent Working → Agent Done → Done |
| Repo Issue | Todo → In Development → Done |
| Slices Parent | Todo → Agent Working → Agent Blocked ⇄ Agent Working → Agent Done |
| Slice 0 | Todo → Agent Working → Agent Blocked/Done → (design done) → same as other slices |
| Slice 1+ | Todo → ... → Done (when all children done) |

**"Agent Blocked"** = agent posted questions, waiting for answers. For Agent Implementation issues with BA questions, the PM auto-dispatches `/po` to have the PO answer. For other blocked issues, answer on Linear then re-run `/pm`.

**"Agent Done"** = agent finished its work. PM will advance to the next stage. Never set to "Done" by agents — only you do that.

## When You're Needed

1. **PO review** — PO auto-answers BA questions, but you may want to review its decisions
2. **TL questions** — technical/architectural questions. Comment: `## Questions from Tech Lead`
3. **Brainstorm review** — TL presents two approaches with trade-offs. Pick one, answer questions, then `/tl-design-finalize`
4. **PR review** — code is ready, PRs created

After answering questions on Linear, re-run `/pm <ID>`.
