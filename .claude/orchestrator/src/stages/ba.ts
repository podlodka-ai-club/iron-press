import type { Action, StageResult } from "../types/contracts.js";
import { config } from "../config.js";
import { runStage, stableSessionId, type StageSpec } from "../sdk/session.js";
import { loadSkill } from "../sdk/skills-loader.js";
import { buildUserPrompt } from "./common.js";
import type { StageDir } from "../runs/run-log.js";

export async function runBa(action: Action, dir: StageDir, runId: string): Promise<StageResult> {
  const spec: StageSpec = {
    role: "ba",
    sessionId: stableSessionId("ba", action.issueId, runId, dir.index),
    model: config.roles.ba.model,
    maxTurns: config.roles.ba.maxTurns,
    budgetUsd: config.roles.ba.budgetUsd,
    systemAppend: loadSkill("business-analyst/analyze-issue"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}

export async function runBaSlice(action: Action, dir: StageDir, runId: string): Promise<StageResult> {
  const designFlag = action.design === "brainstorm" ? " --design=brainstorm" : "";
  const spec: StageSpec = {
    role: "ba-slice",
    sessionId: stableSessionId("ba-slice", action.issueId, runId, dir.index),
    model: config.roles.baSlice.model,
    maxTurns: config.roles.baSlice.maxTurns,
    budgetUsd: config.roles.baSlice.budgetUsd,
    systemAppend: loadSkill("business-analyst/slice-issue"),
    userPrompt: buildUserPrompt(action, `${action.issueId}${designFlag}`),
    dir,
  };
  return runStage(spec);
}

export async function runBaCheckComments(
  action: Action,
  dir: StageDir,
  runId: string,
): Promise<StageResult> {
  const spec: StageSpec = {
    role: "ba-check-comments",
    sessionId: stableSessionId("ba-check-comments", action.issueId, runId, dir.index),
    model: config.roles.baCheckComments.model,
    maxTurns: config.roles.baCheckComments.maxTurns,
    budgetUsd: config.roles.baCheckComments.budgetUsd,
    systemAppend: loadSkill("business-analyst/check-comments"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}
