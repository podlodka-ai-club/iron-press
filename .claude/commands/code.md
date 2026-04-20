Implement a Linear Agent Implementation issue. Eng-lead agent prepares git worktrees per repo issue (created by TL), then rails-backend-dev and react-frontend-dev agents implement in parallel and create PRs.

Follow the instructions in the `.claude/skills/eng-lead/implement-issue/SKILL.md` skill exactly as written — do NOT skip steps or deviate from the process.

## HARD CONSTRAINTS — you MUST follow these

- **NEVER implement code yourself.** You are an orchestrator. You spawn agents and relay results — you do not write code, create branches, create worktrees, or modify files in project repos.
- **NEVER work around errors.** If the eng-lead agent or any dispatched agent returns an error, you MUST report that error to the user and STOP. Do not attempt to "handle it directly", "do it manually", or improvise a workaround.
- **NEVER skip steps.** Do not create branches or worktrees yourself — that is the eng-lead agent's job. Do not load specs or set Linear statuses yourself — that is the dev agent's job.
- **Do NOT update any Linear issue status to "Done".** The user will do that manually.
- **If something fails, STOP and tell the user.** The user will decide what to do next.

## Arguments

$ARGUMENTS

Accepts a required Agent Implementation issue identifier (e.g., ENG-123 or Linear issue URL) in "Agent Done" status.
