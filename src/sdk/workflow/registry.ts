import type { RunLog } from "@/runs/run-log";
import { simpleWorkflow } from "@/workflows/simple/workflow";
import type { Workflow } from "./contracts.js";

// ---------------------------------------------------------------------------
// Workflow registry — every workflow the CLI can run is registered here and
// looked up by its name (the `<workflowName>` positional arg of `pnpm do`).
// Concrete workflow modules live under `src/workflows/<name>/` and only need
// to export a factory function compatible with `WorkflowFactory`.
// ---------------------------------------------------------------------------

export type WorkflowState = { issueId: string; runId: string };

export type WorkflowFactory<TState = WorkflowState> = (
  runLog: RunLog,
  cwd: string,
) => Workflow<TState>;

export const WORKFLOWS: Record<string, WorkflowFactory> = {
  simple: simpleWorkflow,
};

/** Workflow used when the CLI is invoked without an explicit name. */
export const DEFAULT_WORKFLOW = "simple";

export function availableWorkflowNames(): string[] {
  return Object.keys(WORKFLOWS);
}

/**
 * Look up a workflow factory by name. Throws with the list of known names so
 * CLI callers can surface a clear error.
 */
export function getWorkflow(name: string): WorkflowFactory {
  const factory = WORKFLOWS[name];
  if (!factory) {
    throw new Error(
      `Unknown workflow "${name}". Available: ${availableWorkflowNames().join(" | ")}`,
    );
  }
  return factory;
}
