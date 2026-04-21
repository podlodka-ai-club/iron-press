import { writeFileSync } from "node:fs";
import type { Action, StageResult, WorkUnit } from "../../types/contracts.js";
import type { RunLog, StageDir } from "../../runs/run-log.js";
import { prepareWorkUnits, removeWorktree } from "./prepare.js";
import { runDev } from "./dispatch.js";
import { logger } from "../../util/logger.js";

/**
 * Map a WorkUnit label to the sub-stage `kind` used in the slug. This is what
 * surfaces in the UI as a colour-coded badge, so we make it specific per repo:
 *   Backend  → "dev-backend"  (rails-backend-dev, pink)
 *   Frontend → "dev-frontend" (react-frontend-dev, cyan)
 */
function subStageKind(unit: WorkUnit): string {
  return `dev-${unit.label.toLowerCase()}`;
}

/**
 * The code stage is composite: prepare worktrees (deterministic TS),
 * dispatch one dev SDK session per work unit in parallel, then clean up.
 */
export async function runCode(
  action: Action,
  dir: StageDir,
  runId: string,
  runLog: RunLog,
): Promise<StageResult> {
  const prep = await prepareWorkUnits(action.issueId);
  runLog.appendEvent("code_prepared", {
    agentImplId: prep.agentImpl.id,
    workUnits: prep.workUnits.map((u) => ({ id: u.issueId, label: u.label, branch: u.branchName })),
    skipped: prep.skipped,
  });

  // Run each dev stage in parallel as its own sub-stage, distinctly labelled
  // so the UI renders the correct per-agent colour chip (rails vs react).
  const subResults = await Promise.allSettled(
    prep.workUnits.map(async (unit) => {
      const subDir = runLog.openStage({
        kind: subStageKind(unit),
        issueId: unit.issueId,
      });
      return runDev(unit, subDir, runId);
    }),
  );

  let anyFailed = false;
  const createdPrs: string[] = [];
  const updated: string[] = [];
  const blockers: string[] = [];
  let totalCost = 0;
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

  for (let i = 0; i < subResults.length; i++) {
    const r = subResults[i];
    const unit = prep.workUnits[i];
    if (!r || !unit) continue;
    if (r.status === "rejected") {
      anyFailed = true;
      blockers.push(`${unit.issueId} (${unit.label}): ${String(r.reason)}`);
      continue;
    }
    const v = r.value;
    updated.push(unit.issueId);
    totalCost += v.costUsd;
    tokens.input += v.tokens.input;
    tokens.output += v.tokens.output;
    tokens.cacheRead += v.tokens.cacheRead;
    tokens.cacheCreation += v.tokens.cacheCreation;
    if (v.status === "failed") {
      anyFailed = true;
      blockers.push(`${unit.issueId}: ${v.errorMessage ?? "stage failed"}`);
    }
    createdPrs.push(...v.issueIdsCreated);
  }

  // Clean up worktrees even on partial failure — keep the branches.
  await Promise.allSettled(
    prep.workUnits.map((u) =>
      removeWorktree(u.repoPath, u.worktreeDir).catch((e) =>
        logger.warn({ e, unit: u.issueId }, "worktree cleanup failed"),
      ),
    ),
  );

  const result: StageResult = {
    status: anyFailed ? "failed" : "done",
    issueIdsCreated: createdPrs,
    issueIdsUpdated: updated,
    questionsPosted: false,
    blockers,
    summary: `Code stage ran ${prep.workUnits.length} dev agents; ${
      blockers.length
    } failed. Skipped: ${prep.skipped.length}.`,
    costUsd: totalCost,
    tokens,
    sessionId: "",
    transcriptPath: dir.transcriptPath,
    ...(anyFailed ? { errorMessage: blockers.join("; ") } : {}),
  };

  // Persist the composite result so the UI shows this stage as Done / Error
  // rather than stuck on Running. Without this, result.json never appears and
  // deriveStageStatus keeps returning "running".
  try {
    writeFileSync(dir.resultPath, JSON.stringify(result, null, 2));
  } catch (e) {
    logger.warn({ e, path: dir.resultPath }, "failed to write code stage result.json");
  }

  return result;
}
