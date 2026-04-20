import { writeFileSync } from "node:fs";
import path from "node:path";
import { assertConfig, config } from "./config.js";
import type { Action, Flags, PipelineState, RunMeta, StageResult } from "./types/contracts.js";
import { decide, dedupeActions } from "./planner/decide.js";
import { fetchPipelineState, isTerminal } from "./state/pipeline-state.js";
import { createRunLog, type RunLog } from "./runs/run-log.js";
import { renderBlockersReport, writeBlockersReport } from "./runs/blockers-report.js";
import { runBa, runBaSlice, runBaCheckComments } from "./stages/ba.js";
import { runPo } from "./stages/po.js";
import {
  runTl,
  runTlDesign,
  runTlDesignBrainstorm,
  runTlDesignFinalize,
  runTlCheckComments,
} from "./stages/tl.js";
import { runCode } from "./stages/code/index.js";
import { checkMcpHealth } from "./sdk/session.js";
import { logger } from "./util/logger.js";

export interface OrchestrateResult {
  runId: string;
  runDir: string;
  exitCode: number;
  totalCostUsd: number;
  stageCount: number;
}

export interface OrchestrateOptions {
  rootInput: string;
  flags: Flags;
  runId?: string; // for resume
}

const MAX_ITERATIONS = 50; // hard ceiling — one run never does more than 50 planner loops

export async function orchestrate(opts: OrchestrateOptions): Promise<OrchestrateResult> {
  assertConfig();

  const runLog = createRunLog({
    runId: opts.runId,
    rootInput: opts.rootInput,
    flags: opts.flags,
    resume: Boolean(opts.runId),
  });
  const meta: RunMeta = {
    runId: runLog.runId,
    rootInput: opts.rootInput,
    flags: opts.flags,
    startedAt: new Date().toISOString(),
    totalCostUsd: 0,
    totalTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    stageCount: 0,
  };
  runLog.writeMeta(meta);

  let exitCode = 0;
  try {
    if (!opts.flags.dryRun) {
      const health = await checkMcpHealth(config.workspaceRoot);
      runLog.appendEvent("mcp_health", health);
      if (!health.linearAvailable) {
        process.stderr.write(
          `\n[error] Linear MCP plugin is not available (status=${health.linearStatus}).\n\n` +
            `The orchestrator runs in cwd=${config.workspaceRoot} and needs the Linear\n` +
            `plugin to be installed and authenticated for that path.\n\n` +
            `Fix:\n` +
            `  cd ${config.workspaceRoot}\n` +
            `  claude /plugin install linear@claude-plugins-official\n` +
            `  claude /mcp         # authenticate if prompted\n\n` +
            `MCP servers seen this session:\n` +
            health.availableServers.map((s) => `  - ${s.name} (${s.status})`).join("\n") +
            "\n\n",
        );
        runLog.appendEvent("exit_mcp_missing", health);
        exitCode = 1;
        throw new Error("Linear MCP unavailable");
      }
    }

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const state = await fetchPipelineState(opts.rootInput, opts.flags);
      runLog.writeState(state);

      if (isTerminal(state)) {
        logger.info({ runId: runLog.runId }, "pipeline complete");
        runLog.appendEvent("pipeline_complete", { iter });
        break;
      }

      const { actions: rawActions, blockers } = decide(state, opts.flags);
      const actions = filterActions(dedupeActions(rawActions), opts.flags);

      runLog.appendEvent("plan", {
        iter,
        actions: actions.map((a) => ({ kind: a.kind, issueId: a.issueId, reason: a.reason })),
        blockers,
      });

      if (opts.flags.dryRun) {
        logger.info({ actions, blockers }, "dry-run — no dispatch");
        writeDryRunReport(runLog.runDir, actions, blockers);
        break;
      }

      if (actions.length === 0) {
        if (blockers.length > 0) {
          writeBlockersReport(runLog.runDir, blockers);
          process.stdout.write(renderBlockersReport(blockers) + "\n");
          runLog.appendEvent("exit_blocked", { blockers });
          exitCode = 0;
          break;
        }
        logger.info("no actions and no blockers — nothing to do");
        runLog.appendEvent("exit_idle", {});
        break;
      }

      // Dispatch actions — parallelise independent ones
      const results = await dispatchActions(actions, runLog, opts);
      applyResultsToMeta(meta, results);
      runLog.writeMeta(meta);

      // Budget cap
      if (meta.totalCostUsd > opts.flags.maxBudgetUsd) {
        logger.error(
          { runId: runLog.runId, totalCostUsd: meta.totalCostUsd, cap: opts.flags.maxBudgetUsd },
          "global budget exceeded — aborting",
        );
        runLog.appendEvent("exit_budget_exceeded", {
          totalCostUsd: meta.totalCostUsd,
          cap: opts.flags.maxBudgetUsd,
        });
        exitCode = 2;
        break;
      }

      // If every action failed, back off — don't loop forever
      const allFailed = results.every((r) => r.status === "failed");
      if (allFailed) {
        logger.error({ results }, "all actions failed — aborting");
        runLog.appendEvent("exit_all_failed", {});
        exitCode = 1;
        break;
      }
    }
  } catch (err) {
    logger.error({ err }, "orchestrator threw");
    runLog.appendEvent("exit_error", { message: err instanceof Error ? err.message : String(err) });
    exitCode = 1;
  } finally {
    meta.finishedAt = new Date().toISOString();
    meta.exitCode = exitCode;
    runLog.writeMeta(meta);
    runLog.close();
  }

  return {
    runId: runLog.runId,
    runDir: runLog.runDir,
    exitCode,
    totalCostUsd: meta.totalCostUsd,
    stageCount: meta.stageCount,
  };
}

// =============================================================================
// Dispatch
// =============================================================================

async function dispatchActions(
  actions: Action[],
  runLog: RunLog,
  opts: OrchestrateOptions,
): Promise<StageResult[]> {
  // Actions that write to the same Linear issue should not run concurrently.
  // The simplest safe rule: group by issueId, run groups in parallel, run within a group sequentially.
  const groups = new Map<string, Action[]>();
  for (const a of actions) {
    const arr = groups.get(a.issueId) ?? [];
    arr.push(a);
    groups.set(a.issueId, arr);
  }

  const results: StageResult[] = [];

  const groupPromises = [...groups.entries()].map(async ([, group]) => {
    const out: StageResult[] = [];
    for (const action of group) {
      const result = await runSingleAction(action, runLog, opts);
      out.push(result);
      runLog.appendEvent("stage_complete", {
        kind: action.kind,
        issueId: action.issueId,
        status: result.status,
        costUsd: result.costUsd,
      });
    }
    return out;
  });

  const grouped = await Promise.all(groupPromises);
  for (const g of grouped) results.push(...g);
  return results;
}

async function runSingleAction(action: Action, runLog: RunLog, opts: OrchestrateOptions): Promise<StageResult> {
  const dir = runLog.openStage(action);
  logger.info({ kind: action.kind, issueId: action.issueId }, "dispatching stage");
  runLog.appendEvent("stage_started", {
    kind: action.kind,
    issueId: action.issueId,
    stageDir: dir.dir,
  });
  try {
    switch (action.kind) {
      case "ba":
        return await runBa(action, dir, runLog.runId);
      case "ba-slice":
        return await runBaSlice(action, dir, runLog.runId);
      case "ba-check-comments":
        return await runBaCheckComments(action, dir, runLog.runId);
      case "po":
        return await runPo(action, dir, runLog.runId);
      case "tl":
        return await runTl(action, dir, runLog.runId);
      case "tl-design":
        return await runTlDesign(action, dir, runLog.runId);
      case "tl-design-brainstorm":
        return await runTlDesignBrainstorm(action, dir, runLog.runId);
      case "tl-design-finalize":
        return await runTlDesignFinalize(action, dir, runLog.runId);
      case "tl-check-comments":
        return await runTlCheckComments(action, dir, runLog.runId);
      case "code":
        return await runCode(action, dir, runLog.runId, runLog);
      default: {
        const exhaustive: never = action.kind;
        throw new Error(`unhandled action kind: ${exhaustive as string}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ kind: action.kind, issueId: action.issueId, err: msg }, "stage threw");
    return {
      status: "failed",
      issueIdsCreated: [],
      issueIdsUpdated: [],
      questionsPosted: false,
      blockers: [],
      summary: `Stage ${action.kind} threw before producing a result`,
      costUsd: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      sessionId: "",
      transcriptPath: dir.transcriptPath,
      errorMessage: msg,
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function filterActions(actions: Action[], flags: Flags): Action[] {
  let out = actions;
  if (flags.noCode) out = out.filter((a) => a.kind !== "code");
  if (flags.stages && flags.stages.length > 0) {
    out = out.filter((a) => flags.stages!.includes(a.kind));
  }
  return out;
}

function applyResultsToMeta(meta: RunMeta, results: StageResult[]): void {
  for (const r of results) {
    meta.totalCostUsd += r.costUsd;
    meta.totalTokens.input += r.tokens.input;
    meta.totalTokens.output += r.tokens.output;
    meta.totalTokens.cacheRead += r.tokens.cacheRead;
    meta.totalTokens.cacheCreation += r.tokens.cacheCreation;
    meta.stageCount += 1;
  }
}

function writeDryRunReport(runDir: string, actions: Action[], blockers: unknown): void {
  writeFileSync(
    path.join(runDir, "dry-run.json"),
    JSON.stringify({ actions, blockers }, null, 2),
  );
  process.stdout.write("\n# Dry run — next actions\n\n");
  if (actions.length === 0) process.stdout.write("  (no actions)\n");
  for (const a of actions) {
    process.stdout.write(`  • ${a.kind} ${a.issueId} — ${a.reason}\n`);
  }
  process.stdout.write("\n");
}

// Suppress unused warning for `PipelineState` re-export (kept for future consumers)
export type { PipelineState };
