#!/usr/bin/env node
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  GraphologyEngine,
  DEFAULT_WORKFLOW,
  WORKFLOWS,
  availableWorkflowNames,
  getWorkflow,
  discoverDynamicWorkflows,
  type WorkflowFactory,
  type WorkflowState,
} from "@/sdk/workflow";
import { createRunLog } from "@/runs/run-log";
import { assertConfig, config } from "@/config";
import { logger } from "@/util/logger";
import { LinearClient } from "@/linear/linear-client";
import type { LinearIssue } from "@/linear/linear-contracts";
import { pollForNewIssues } from "@/polling/poller";
import { prepareRepository } from "@/git/repo-manager";

async function main(): Promise<void> {
  // Register built-in TypeScript workflows. Done here via dynamic import() so
  // that workflow files (which import AgentNode, which imports from this SDK
  // module) are loaded after all static module-level imports have settled,
  // avoiding a circular-module initialisation race.
  const [defaultMod, simpleMod] = await Promise.all([
    import("@/workflows/default/workflow"),
    import("@/workflows/simple/workflow"),
  ]);
  WORKFLOWS["default"] = defaultMod.defaultWorkflow as WorkflowFactory;
  WORKFLOWS["simple"] = simpleMod.simpleWorkflow as WorkflowFactory;

  // Discover workflow.json-based workflows and merge them in. Static workflows
  // registered in WORKFLOWS take precedence on name collision.
  const workflowsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "workflows");
  const dynamic = discoverDynamicWorkflows(workflowsDir);
  for (const [name, factory] of Object.entries(dynamic)) {
    WORKFLOWS[name] = factory;
  }

  // Hardcoded TypeScript workflows take precedence over any same-named JSON discovery.
  WORKFLOWS["default"] = defaultMod.defaultWorkflow as WorkflowFactory;
  WORKFLOWS["simple"] = simpleMod.simpleWorkflow as WorkflowFactory;

  const available = availableWorkflowNames().join(" | ");
  const program = new Command()
    .name("do")
    .description("Run a named workflow against a Linear issue, or poll for new issues.")
    .argument(
      "[workflowName]",
      `workflow to run (${available}); defaults to "${DEFAULT_WORKFLOW}" when only an issue id is given`,
    )
    .argument("[issueId]", "Linear issue identifier, e.g. ENG-123")
    .option("--cwd <path>", "working directory the SDK session runs in")
    .option("--run-id <id>", "reuse an existing .runs/<id> directory (resumes stage counter)")
    .option("--poll", "poll for new issues and run workflows in a loop")
    .option("--resume <nodeId>", "resume a suspended run from the given node (requires --run-id)")
    .parse(process.argv);

  const opts = program.opts<{ cwd?: string; runId?: string; poll?: boolean; resume?: string }>();

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

  if (opts.resume && !opts.runId) {
    // eslint-disable-next-line no-console
    console.error("--resume requires --run-id");
    process.exit(1);
  }

  assertConfig();

  const cwd = opts.cwd ?? process.cwd();

  const runLog = createRunLog({
    runId: opts.runId,
    rootInput: issueId,
    flags: { workflow: workflowName, cwd },
    resume: Boolean(opts.runId),
  });

  logger.info(
    { runId: runLog.runId, workflow: workflowName, issueId, cwd },
    "workflow starting",
  );

  const workflow = factory(runLog, cwd);
  const engine = new GraphologyEngine<WorkflowState>();
  const workflowStatePath = path.join(runLog.runDir, "workflow-state.json");

  // Restore persisted state when resuming; otherwise start fresh.
  let initialState: WorkflowState;
  if (opts.resume) {
    if (!existsSync(workflowStatePath)) {
      // eslint-disable-next-line no-console
      console.error(`No saved workflow state at ${workflowStatePath}. Run the workflow first.`);
      process.exit(1);
    }
    try {
      initialState = JSON.parse(readFileSync(workflowStatePath, "utf8")) as WorkflowState;
    } catch {
      // eslint-disable-next-line no-console
      console.error(`Failed to parse workflow state from ${workflowStatePath}`);
      process.exit(1);
    }
  } else {
    initialState = { issueId, runId: runLog.runId };
  }

  try {
    const engineHooks = {
    onNodeEnter: (nodeId: string) => {
      runLog.appendEvent("node_entered", { nodeId });
    },
    onNodeExit: (nodeId: string, status: string) => {
      runLog.appendEvent("node_exited", { nodeId, status });
    },
  };

  const result = opts.resume
      ? await engine.resume(workflow, opts.resume, initialState, engineHooks, { runId: runLog.runId })
      : await engine.run(workflow, initialState, engineHooks, { runId: runLog.runId });

    // Persist final state so a subsequent --resume can restore workflow-specific fields.
    writeFileSync(workflowStatePath, JSON.stringify(result.finalState, null, 2));

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

function resolveWorkflowForIssue(issue: LinearIssue): string {
  const fallback = config.appConfig?.defaultWorkflow ?? DEFAULT_WORKFLOW;
  const mapping = config.appConfig?.workflowMapping;
  if (mapping) {
    for (const label of issue.labels) {
      const name = mapping[label];
      if (name) {
        try {
          getWorkflow(name);
          return name;
        } catch {
          logger.warn({ label, workflow: name }, "mapped workflow not found, skipping label");
        }
      }
    }
  }
  return fallback;
}

async function runPollingMode(cwdOverride?: string): Promise<void> {
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
          const workflowName = resolveWorkflowForIssue(issue);

          let cwd: string;
          if (cwdOverride) {
            cwd = cwdOverride;
          } else if (config.appConfig?.repository) {
            logger.info(
              { url: config.appConfig.repository.url },
              "preparing repository",
            );
            cwd = prepareRepository(config.appConfig.repository);
          } else {
            throw new Error(
              "No repository configured. Pass --cwd or set repository.url in iron-press.config.json",
            );
          }

          const runLog = createRunLog({
            rootInput: issue.id,
            flags: { workflow: workflowName, cwd, polling: true },
            resume: false,
          });

          logger.info(
            { runId: runLog.runId, workflow: workflowName, issueId: issue.id, cwd },
            "workflow starting for polled issue",
          );

          const factory = getWorkflow(workflowName);
          const workflow = factory(runLog, cwd, {
            baseBranch: config.appConfig?.repository?.baseBranch,
            branchPrefix: config.appConfig?.repository?.branchPrefix,
          });
          const engine = new GraphologyEngine<WorkflowState>();

          const pollEngineHooks = {
            onNodeEnter: (nodeId: string) => {
              runLog.appendEvent("node_entered", { nodeId });
            },
            onNodeExit: (nodeId: string, status: string) => {
              runLog.appendEvent("node_exited", { nodeId, status });
            },
          };

          const result = await engine.run(
            workflow,
            { issueId: issue.id, runId: runLog.runId },
            pollEngineHooks,
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
