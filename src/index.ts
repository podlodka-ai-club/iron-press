#!/usr/bin/env node
import { Command } from "commander";
import {
  GraphologyEngine,
  DEFAULT_WORKFLOW,
  availableWorkflowNames,
  getWorkflow,
  type WorkflowState,
} from "@/sdk/workflow";
import { createRunLog } from "@/runs/run-log";
import { assertConfig } from "@/config";
import { logger } from "@/util/logger";

async function main(): Promise<void> {
  const available = availableWorkflowNames().join(" | ");
  const program = new Command()
    .name("do")
    .description("Run a named workflow against a Linear issue.")
    .argument(
      "[workflowName]",
      `workflow to run (${available}); defaults to "${DEFAULT_WORKFLOW}" when only an issue id is given`,
    )
    .argument("[issueId]", "Linear issue identifier, e.g. ENG-123")
    .option("--cwd <path>", "working directory the SDK session runs in", process.cwd())
    .option("--run-id <id>", "reuse an existing .runs/<id> directory (resumes stage counter)")
    .parse(process.argv);

  // Two-arg form: `do <workflow> <issue>`.
  // One-arg form: `do <issue>` — falls back to DEFAULT_WORKFLOW.
  const [first, second] = program.args;
  let workflowName: string;
  let issueId: string;
  if (first && second) {
    workflowName = first;
    issueId = second;
  } else if (first) {
    workflowName = DEFAULT_WORKFLOW;
    issueId = first;
  } else {
    program.help({ error: true });
    return;
  }

  let factory;
  try {
    factory = getWorkflow(workflowName);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error((err as Error).message);
    process.exit(1);
  }

  const opts = program.opts<{ cwd: string; runId?: string }>();

  assertConfig();

  const runLog = createRunLog({
    runId: opts.runId,
    rootInput: issueId,
    flags: { workflow: workflowName, cwd: opts.cwd },
    resume: Boolean(opts.runId),
  });

  logger.info(
    { runId: runLog.runId, workflow: workflowName, issueId, cwd: opts.cwd },
    "workflow starting",
  );

  const workflow = factory(runLog, opts.cwd);
  const engine = new GraphologyEngine<WorkflowState>();

  try {
    const result = await engine.run(
      workflow,
      { issueId, runId: runLog.runId },
      {},
      { runId: runLog.runId },
    );

    runLog.appendEvent("run_finished", {
      workflow: workflowName,
      finalStatus: result.finalStatus,
      exitReason: result.exitReason,
      history: result.history,
    });

    logger.info(
      {
        runId: runLog.runId,
        workflow: workflowName,
        finalStatus: result.finalStatus,
        exitReason: result.exitReason,
        history: result.history.map((h) => `${h.nodeId}:${h.status}`),
      },
      "workflow finished",
    );

    // Exit code mirrors terminal status:
    //   Pass          → 0
    //   WaitUserInput → 2 (suspended, resumable)
    //   Fail          → 1
    process.exitCode =
      result.finalStatus === "Pass"
        ? 0
        : result.finalStatus === "WaitUserInput"
          ? 2
          : 1;
  } catch (err) {
    logger.error({ err, runId: runLog.runId, workflow: workflowName }, "workflow errored");
    runLog.appendEvent("run_errored", { message: (err as Error).message });
    process.exitCode = 1;
  } finally {
    runLog.close();
  }
}

main().catch((err) => {
  // Last-resort handler — logger.error should already have been called for
  // anything thrown inside main(). This covers synchronous init failures.
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
