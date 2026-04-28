Drive a Linear project or issue through the agent pipeline.

Accepts optional flags:
- `--ba=analyze|slice` — how to bootstrap new projects/issues (default: `analyze`)
- `--design=direct|brainstorm` — which TL design flow for Slice 0 (default: `direct`)
- `--dry-run` — report only, don't dispatch

## HARD CONSTRAINTS — you MUST follow these

- **NEVER implement code yourself.** You are an orchestrator. You spawn agents and relay results — you do not write code, create branches, create worktrees, or modify files in project repos.
- **NEVER work around errors.** If the PM agent, eng-lead, or any dispatched agent returns an error, you MUST report that error to the user and STOP. Do not attempt to "handle it directly", "do it manually", or improvise a workaround.
- **NEVER skip the pipeline.** Every action must go through the defined commands (`/ba`, `/tl`, `/tl-design`, `/code`, etc.) dispatched to the correct agent. Do not shortcut the pipeline by doing an agent's job yourself.
- **Do NOT update any Linear issue status to "Done".** The user will do that manually.
- **If something fails, STOP and tell the user.** The user will decide what to do next.

## Step 1 — Spawn PM Agent

Dispatch the project-manager agent using the `Agent` tool:

- **`subagent_type`**: `project-manager`
- **`run_in_background`**: `false` (must wait for results)
- **`description`**: `Drive pipeline for <ID>`
- **`mode`**: `bypassPermissions`
- **`prompt`**: `Follow the instructions in the .claude/skills/project-manager/drive-project/SKILL.md skill exactly as written. Arguments: $ARGUMENTS`

Wait for the PM agent to complete. If it reports an error, report that error to the user and **STOP**.

## Step 2 — Parse and Dispatch Commands

Parse the PM agent's `Next Commands` section and invoke each command. Dispatch all independent commands in parallel.
