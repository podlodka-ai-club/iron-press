/**
 * Status derivation — pure functions operating on artifacts already written by
 * the orchestrator. Never mutates anything.
 */

/**
 * Run statuses surfaced in the UI. `done` means the orchestrator finished
 * successfully (or was stopped cleanly with exit 0); `error` covers both
 * terminal-error events and any run that finished with a non-zero exit code.
 * We deliberately avoid "stopped" as a user-facing concept — every finished
 * run is either Done or Error from the user's point of view.
 */
export type RunStatus = "running" | "done" | "blocked" | "error" | "unknown";
export type StageStatus = "running" | "done" | "blocked" | "error" | "unknown";

export function deriveRunStatus(
  meta: { startedAt?: string; finishedAt?: string; exitCode?: number } | null,
  eventTypes: string[],
  events?: Array<{ type: string; data?: Record<string, unknown> }>,
): RunStatus {
  if (!meta && eventTypes.length === 0) return "unknown";

  // Current engine events
  if (eventTypes.includes("run_finished")) {
    const finishedEvent = events?.findLast((e) => e.type === "run_finished");
    const finalStatus = finishedEvent?.data?.finalStatus as string | undefined;
    if (finalStatus === "Fail") return "error";
    if (finalStatus === "WaitUserInput") return "blocked";
    return "done";
  }
  if (eventTypes.includes("run_errored")) return "error";

  // Legacy events (older orchestrator versions)
  if (eventTypes.includes("pipeline_complete")) return "done";
  if (eventTypes.includes("exit_idle")) return "done";
  if (eventTypes.includes("exit_blocked")) return "blocked";
  if (
    eventTypes.includes("exit_error") ||
    eventTypes.includes("exit_all_failed") ||
    eventTypes.includes("exit_budget_exceeded") ||
    eventTypes.includes("exit_mcp_missing")
  ) {
    return "error";
  }

  // No terminal event seen. Use the recorded exit code as a fallback — the
  // orchestrator writes it on exit regardless of path.
  if (meta?.finishedAt) {
    if (typeof meta.exitCode === "number") {
      return meta.exitCode === 0 ? "done" : "error";
    }
    // finishedAt present but no exitCode — process was killed mid-write.
    return "error";
  }

  if (meta?.startedAt || eventTypes.includes("run_started") || eventTypes.includes("run_resumed")) return "running";
  return "unknown";
}

export function deriveStageStatus(
  result: { status?: string } | null,
): StageStatus {
  if (!result) return "running";
  const s = result.status;
  if (s === "done" || s === "Pass") return "done";
  if (s === "blocked" || s === "WaitUserInput") return "blocked";
  if (s === "failed" || s === "Fail") return "error";
  return "unknown";
}

/**
 * Colour hint used by the frontend for role chips. Aligned with the `color`
 * field in `.claude/agents/*.md` frontmatter so the UI mirrors the agent's
 * identity:
 *   business-analyst   → yellow
 *   product-owner      → purple
 *   tech-lead          → blue
 *   eng-lead (code)    → orange
 *   rails-backend-dev  → pink   (Backend sub-stage)
 *   react-frontend-dev → cyan   (Frontend sub-stage)
 *   project-manager    → green
 * Check-comments stages inherit their parent role's colour.
 */
export type RoleColour =
  | "yellow"
  | "purple"
  | "blue"
  | "orange"
  | "pink"
  | "cyan"
  | "green"
  | "gray";

export function roleColour(kind: string): RoleColour {
  if (kind === "ba" || kind === "ba-slice" || kind === "ba-check-comments") return "yellow";
  if (kind === "po") return "purple";
  if (kind.startsWith("tl")) return "blue";
  if (kind === "code") return "orange";
  if (kind === "dev-backend") return "pink";
  if (kind === "dev-frontend") return "cyan";
  if (kind === "pm") return "green";
  return "gray";
}
