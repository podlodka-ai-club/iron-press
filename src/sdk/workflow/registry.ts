import { type Dirent, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { RunLog } from "@/runs/run-log";
import { simpleWorkflow } from "@/workflows/simple/workflow";
import type { Workflow } from "./contracts.js";
import { loadWorkflowFromJson } from "./dynamic-loader.js";

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

/**
 * Scan `workflowsBaseDir` for subdirectories containing a `workflow.json` and
 * return a map of name → lazy WorkflowFactory. Static workflows take precedence
 * on name collision — callers should spread this result first, then overwrite
 * with WORKFLOWS.
 */
export function discoverDynamicWorkflows(
  workflowsBaseDir: string,
): Record<string, WorkflowFactory> {
  const discovered: Record<string, WorkflowFactory> = {};
  let entries: Dirent[];
  try {
    entries = readdirSync(workflowsBaseDir, { withFileTypes: true });
  } catch {
    return discovered;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const jsonPath = path.join(workflowsBaseDir, entry.name, "workflow.json");
    if (!existsSync(jsonPath)) continue;
    const workflowDir = path.join(workflowsBaseDir, entry.name);
    const name = entry.name;
    discovered[name] = (runLog, cwd) => loadWorkflowFromJson(workflowDir, runLog, cwd);
  }
  return discovered;
}
