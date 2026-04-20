import { writeFileSync } from "node:fs";
import { config } from "../../config.js";
import type { StageDir } from "../../runs/run-log.js";
import { runStage, stableSessionId, type StageSpec } from "../../sdk/session.js";
import { loadAgent } from "../../sdk/skills-loader.js";
import { STAGE_RESULT_CONTRACT_MARKDOWN, type StageResult, type WorkUnit } from "../../types/contracts.js";

/**
 * Dispatch a single dev agent for one WorkUnit as a parallel SDK session.
 * Each dev runs inside its own worktree (cwd=worktreePath) so they cannot
 * interfere with each other even when running concurrently.
 */
export async function runDev(
  unit: WorkUnit,
  dir: StageDir,
  runId: string,
): Promise<StageResult> {
  const agentFile =
    unit.agentType === "rails-backend-dev"
      ? loadAgent("rails-backend-dev")
      : loadAgent("react-frontend-dev");

  const systemAppend = `
You are implementing a specific repo slice of a Linear feature.

# WORKING DIRECTORY / BRANCH / REPO

- worktreePath: ${unit.worktreePath}
- branchName:   ${unit.branchName}
- baseBranch:   ${unit.baseBranch}
- repoPath:     ${unit.repoPath}

ALL file operations and bash commands MUST use the worktreePath as the base. Do NOT
modify anything outside ${unit.worktreePath}.

Before doing anything else, verify:
1. \`ls ${unit.worktreePath}\` succeeds.
2. \`cd ${unit.worktreePath} && git branch --show-current\` outputs exactly ${unit.branchName}.
3. \`cd ${unit.worktreePath} && git remote get-url origin\` contains the expected repo name.

Linear issue: ${unit.issueId} (${unit.label}). Set its status to "In Development" when you
begin, and open a PR at the end with: \`gh pr create --base ${unit.baseBranch} --title "${unit.issueId}: ${unit.issueName}" --body "..."\`.

# AGENT PROFILE (appended)

${agentFile}
`;

  const userPrompt = `
Implement the ${unit.label} portion of Linear issue ${unit.parentIssueId} in the
${unit.label === "Backend" ? "Rails" : "React"} repo.

Follow the Technical Implementation spec in Linear issue ${unit.issueId}.

When done, push the branch and open a PR as described above, then emit the
StageResult block below.

${STAGE_RESULT_CONTRACT_MARKDOWN}
`;

  writeFileSync(dir.promptPath, `# Dev prompt for ${unit.issueId} (${unit.label})\n\n${userPrompt}`);

  const spec: StageSpec = {
    role: "dev",
    sessionId: stableSessionId(`dev-${unit.label.toLowerCase()}`, unit.issueId, runId, dir.index),
    model: config.roles.dev.model,
    maxTurns: config.roles.dev.maxTurns,
    budgetUsd: config.roles.dev.budgetUsd,
    systemAppend,
    userPrompt,
    dir,
    workUnit: unit,
    cwd: unit.worktreePath,
  };
  return runStage(spec);
}
