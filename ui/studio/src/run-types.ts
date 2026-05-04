// Types mirroring ui/artifacts.ts for use in the Studio frontend

export type RunStatus = "running" | "done" | "blocked" | "error" | "unknown";
export type StageStatus = "running" | "done" | "blocked" | "error" | "unknown";
export type NodeStatus = "Pass" | "Fail" | "WaitUserInput";

export interface StageSummary {
  index: number;
  slug: string;
  kind: string;
  issueId: string;
  issueTitle?: string;
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  costUsd?: number;
  summary?: string;
  transcriptLineCount: number;
  toolCallCount: number;
  hasStderr: boolean;
  questionsPosted?: boolean;
  errorMessage?: string;
}

export interface EventRecord {
  t: string;
  type: string;
  data: unknown;
}

export interface RunDetail {
  runId: string;
  runDir: string;
  meta: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
  events: EventRecord[];
  stages: StageSummary[];
  blockers: unknown[] | null;
  status: RunStatus;
}

export interface HistoryEntry {
  nodeId: string;
  nodeName: string;
  status: NodeStatus;
  enteredAt: string;
  exitedAt: string;
  visitIndex: number;
}

/**
 * Execution state derived from SSE events for one node in the graph.
 */
export type NodeExecutionState =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "waiting";

export interface NodeExecutionInfo {
  state: NodeExecutionState;
  enteredAt?: string;
  exitedAt?: string;
  durationMs?: number;
  visitCount: number;
}
