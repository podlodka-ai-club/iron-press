import type { Action, StageResult } from "../types/contracts.js";
import { config } from "../config.js";
import { runStage, stableSessionId, type StageSpec } from "../sdk/session.js";
import { loadSkill } from "../sdk/skills-loader.js";
import { buildUserPrompt } from "./common.js";
import type { StageDir } from "../runs/run-log.js";

export async function runTl(action: Action, dir: StageDir, runId: string): Promise<StageResult> {
  const spec: StageSpec = {
    role: "tl",
    sessionId: stableSessionId("tl", action.issueId, runId, dir.index),
    model: config.roles.tl.model,
    maxTurns: config.roles.tl.maxTurns,
    budgetUsd: config.roles.tl.budgetUsd,
    systemAppend: loadSkill("tech-lead/prepare-issue"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}

export async function runTlDesign(action: Action, dir: StageDir, runId: string): Promise<StageResult> {
  const spec: StageSpec = {
    role: "tl-design",
    sessionId: stableSessionId("tl-design", action.issueId, runId, dir.index),
    model: config.roles.tlDesign.model,
    maxTurns: config.roles.tlDesign.maxTurns,
    budgetUsd: config.roles.tlDesign.budgetUsd,
    systemAppend: loadSkill("tech-lead/architecture-design"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}

export async function runTlDesignBrainstorm(
  action: Action,
  dir: StageDir,
  runId: string,
): Promise<StageResult> {
  const spec: StageSpec = {
    role: "tl-design-brainstorm",
    sessionId: stableSessionId("tl-design-brainstorm", action.issueId, runId, dir.index),
    model: config.roles.tlDesignBrainstorm.model,
    maxTurns: config.roles.tlDesignBrainstorm.maxTurns,
    budgetUsd: config.roles.tlDesignBrainstorm.budgetUsd,
    systemAppend: loadSkill("tech-lead/architecture-design-brainstorm"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}

export async function runTlDesignFinalize(
  action: Action,
  dir: StageDir,
  runId: string,
): Promise<StageResult> {
  const spec: StageSpec = {
    role: "tl-design-finalize",
    sessionId: stableSessionId("tl-design-finalize", action.issueId, runId, dir.index),
    model: config.roles.tlDesignFinalize.model,
    maxTurns: config.roles.tlDesignFinalize.maxTurns,
    budgetUsd: config.roles.tlDesignFinalize.budgetUsd,
    systemAppend: loadSkill("tech-lead/architecture-design-brainstorm/finalize.md"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}

export async function runTlCheckComments(
  action: Action,
  dir: StageDir,
  runId: string,
): Promise<StageResult> {
  const spec: StageSpec = {
    role: "tl-check-comments",
    sessionId: stableSessionId("tl-check-comments", action.issueId, runId, dir.index),
    model: config.roles.tlCheckComments.model,
    maxTurns: config.roles.tlCheckComments.maxTurns,
    budgetUsd: config.roles.tlCheckComments.budgetUsd,
    systemAppend: loadSkill("tech-lead/check-comments"),
    userPrompt: buildUserPrompt(action, action.issueId),
    dir,
  };
  return runStage(spec);
}
