import type { Action, StageResult } from "../types/contracts.js";
import { config } from "../config.js";
import { runStage, stableSessionId, type StageSpec } from "../sdk/session.js";
import { loadSkill } from "../sdk/skills-loader.js";
import { buildUserPrompt } from "./common.js";
import type { StageDir } from "../runs/run-log.js";

export async function runPo(action: Action, dir: StageDir, runId: string): Promise<StageResult> {
  const spec: StageSpec = {
    role: "po",
    sessionId: stableSessionId("po", action.issueId, runId, dir.index),
    model: config.roles.po.model,
    maxTurns: config.roles.po.maxTurns,
    budgetUsd: config.roles.po.budgetUsd,
    systemAppend: loadSkill("product-owner/check-issue"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}
