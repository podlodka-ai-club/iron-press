#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  GraphologyEngine,
  DEFAULT_WORKFLOW,
  WORKFLOWS,
  availableWorkflowNames,
  getWorkflow,
  discoverDynamicWorkflows,
  type WorkflowState,
} from "@/sdk/workflow";
import { createRunLog } from "@/runs/run-log";
import { assertConfig, config } from "@/config";
import { logger } from "@/util/logger";
import { LinearClient } from "@/linear/linear-client";
import { pollForNewIssues } from "@/polling/poller";

async function main(): Promise<void> {
  // Discover workflow.json-based workflows and merge them in. Static workflows
  // registered in WORKFLOWS take precedence on name collision.
  const workflowsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "workflows");
  const dynamic = discoverDynamicWorkflows(workflowsDir);
  for (const [name, factory] of Object.entries(dynamic)) {
    if (!(name in WORKFLOWS)) WORKFLOWS[name] = factory;
  }

  const available = availableWorkflowNames().join(" | ");
  const program = new Command()
    .name("do")
    .description("Run a named workflow against a Linear issue, or poll for new issues.")
    .argument(
      "[workflowName]",
      `workflow to run (${available}); defaults to "${DEFAULT_WORKFLOW}" when only an issue id is given`,
    )
    .argument("[issueId]", "Linear issue identifier, e.g. ENG-123")
    .option("--cwd <path>", "working directory the SDK session runs in", process.cwd())
    .option("--run-id <id>", "reuse an existing .runs/<id> directory (resumes stage counter)")
    .option("--poll", "poll for new issues and run workflows in a loop")
    .parse(process.argv);

  const opts = program.opts<{ cwd: string; runId?: string; poll?: boolean }>();

  // Handle polling mode
  if (opts.poll) {
    assertConfig();
    await runPollingMode(opts.cwd);
    return;
  }

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

async function runPollingMode(cwd: string): Promise<void> {
  const linearClient = new LinearClient(config.linearApiKey, logger);

  logger.info(
    {
      pollingIntervalMs: config.pollingIntervalMs,
      pollingTeamId: config.pollingTeamId,
      pollingProjectId: config.pollingProjectId,
    },
    "starting polling mode",
  );

  // Run polling loop indefinitely
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const pollResult = await pollForNewIssues(linearClient);

      // Run workflow for each new issue
      for (const issue of pollResult.newIssues) {
        logger.info({ issueId: issue.id, issueTitle: issue.title }, "processing polled issue");

        try {
          const runLog = createRunLog({
            rootInput: issue.id,
            flags: { workflow: DEFAULT_WORKFLOW, cwd, polling: true },
            resume: false,
          });

          logger.info(
            { runId: runLog.runId, workflow: DEFAULT_WORKFLOW, issueId: issue.id },
            "workflow starting for polled issue",
          );

          const factory = getWorkflow(DEFAULT_WORKFLOW);
          const workflow = factory(runLog, cwd);
          const engine = new GraphologyEngine<WorkflowState>();

          const result = await engine.run(
            workflow,
            { issueId: issue.id, runId: runLog.runId },
            {},
            { runId: runLog.runId },
          );

          runLog.appendEvent("run_finished", {
            workflow: DEFAULT_WORKFLOW,
            finalStatus: result.finalStatus,
            exitReason: result.exitReason,
            history: result.history,
          });

          logger.info(
            {
              runId: runLog.runId,
              workflow: DEFAULT_WORKFLOW,
              issueId: issue.id,
              finalStatus: result.finalStatus,
            },
            "workflow finished for polled issue",
          );

          runLog.close();
        } catch (err) {
          logger.error(
            { err, issueId: issue.id },
            "failed to process polled issue",
          );
        }
      }

      // Wait before next poll
      logger.info(
        { nextPollMs: config.pollingIntervalMs },
        "waiting for next poll",
      );
      await new Promise((resolve) => setTimeout(resolve, config.pollingIntervalMs));
    } catch (err) {
      logger.error({ err }, "polling error, retrying in next cycle");
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, config.pollingIntervalMs));
    }
  }
}

main().catch((err) => {
  // Last-resort handler — logger.error should already have been called for
  // anything thrown inside main(). This covers synchronous init failures.
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
