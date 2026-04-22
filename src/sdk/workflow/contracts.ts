import { z } from "zod";
import type { DirectedGraph } from "graphology";

// ---------------------------------------------------------------------------
// NodeStatus — fixed vocabulary driving all control flow
// ---------------------------------------------------------------------------

export const NODE_STATUSES = ["Pass", "Fail", "WaitUserInput"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];
export const NodeStatusSchema = z.enum(NODE_STATUSES);

// ---------------------------------------------------------------------------
// NodeContext — passed to every node handler
// ---------------------------------------------------------------------------

export interface NodeContext<TState> {
  /** Shared mutable state. Handlers read from and write to this directly. */
  state: TState;
  /** Unique id of the currently-executing node. */
  readonly nodeId: string;
  /** Zero-based visit count for this node in the current run. */
  readonly visitCount: number;
}

// ---------------------------------------------------------------------------
// Node — the primary contract for workflow steps
// ---------------------------------------------------------------------------

export interface Node<TState> {
  /** Unique graph key used as the Graphology node id. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Called before execute(). Side-effects only; no status return. */
  onEnter?: (ctx: NodeContext<TState>) => Promise<void>;
  /** Core logic. Mutates ctx.state in place; returns the output status. */
  execute: (ctx: NodeContext<TState>) => Promise<{ status: NodeStatus }>;
  /** Called after execute(), receives the status that was produced. */
  onExit?: (ctx: NodeContext<TState>, status: NodeStatus) => Promise<void>;
}

// ---------------------------------------------------------------------------
// WorkflowEdge — declared transition between two nodes
// ---------------------------------------------------------------------------

export interface WorkflowEdge {
  /** Source node id. */
  from: string;
  /** Target node id. */
  to: string;
  /** Status(es) from the source node that trigger this edge. */
  onStatus: NodeStatus | readonly NodeStatus[];
}

// ---------------------------------------------------------------------------
// Graphology attribute interfaces — typed slots stored on graph nodes / edges
// ---------------------------------------------------------------------------

export interface NodeAttributes {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: Node<any>;
}

export interface EdgeAttributes {
  onStatus: NodeStatus | readonly NodeStatus[];
}

// ---------------------------------------------------------------------------
// Workflow — immutable compiled container
// ---------------------------------------------------------------------------

export interface Workflow<TState> {
  /** Underlying Graphology directed graph. */
  readonly graph: DirectedGraph<NodeAttributes, EdgeAttributes>;
  /** Node id where execution begins. */
  readonly initialNodeId: string;
}

// ---------------------------------------------------------------------------
// ExecutionContext — runtime snapshot passed to engine-level hooks
// ---------------------------------------------------------------------------

export const ExecutionContextSchema = z.object({
  runId: z.string(),
  currentNodeId: z.string(),
  previousNodeId: z.string().optional(),
  lastStatus: NodeStatusSchema.optional(),
  visitCounts: z.record(z.string(), z.number()),
  startedAt: z.string(),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

// ---------------------------------------------------------------------------
// HistoryEntry — one record per node visit
// ---------------------------------------------------------------------------

export const HistoryEntrySchema = z.object({
  nodeId: z.string(),
  nodeName: z.string(),
  status: NodeStatusSchema,
  enteredAt: z.string(),
  exitedAt: z.string(),
  visitIndex: z.number().int().nonnegative(),
});

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

// ---------------------------------------------------------------------------
// ExecutionResult — returned by Engine.run()
// ---------------------------------------------------------------------------

export const ExecutionResultSchema = z.object({
  finalStatus: NodeStatusSchema,
  /**
   * "terminal-status" — ended on WaitUserInput (suspended).
   * "no-matching-edge" — no outgoing edge matched the last status (natural end).
   */
  exitReason: z.enum(["terminal-status", "no-matching-edge"]),
  history: z.array(HistoryEntrySchema),
  visitCounts: z.record(z.string(), z.number()),
  startedAt: z.string(),
  finishedAt: z.string(),
});

export type ExecutionResult<TState> = z.infer<typeof ExecutionResultSchema> & {
  finalState: TState;
};

// ---------------------------------------------------------------------------
// EngineHooks — optional cross-cutting callbacks (engine level)
// ---------------------------------------------------------------------------

export interface EngineHooks<TState> {
  /** Called after node.onEnter, before node.execute. */
  onNodeEnter?: (nodeId: string, ctx: ExecutionContext, state: TState) => void | Promise<void>;
  /** Called after node.onExit. */
  onNodeExit?: (
    nodeId: string,
    status: NodeStatus,
    ctx: ExecutionContext,
    state: TState,
  ) => void | Promise<void>;
  /** Called when the engine follows an edge to a new node. */
  onTransition?: (
    from: string,
    to: string,
    status: NodeStatus,
    ctx: ExecutionContext,
  ) => void | Promise<void>;
  /** Called once when the run ends. */
  onTerminate?: (result: ExecutionResult<TState>) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// EngineOptions
// ---------------------------------------------------------------------------

export const EngineOptionsSchema = z.object({
  /** Hard ceiling on per-node visits before throwing VISIT_LIMIT_EXCEEDED. Default: 100. */
  maxVisitsPerNode: z.number().int().positive().default(100),
  /** Explicit run id for observability. Auto-generated if omitted. */
  runId: z.string().optional(),
});

export type EngineOptions = z.infer<typeof EngineOptionsSchema>;

// ---------------------------------------------------------------------------
// Engine — abstract interface
// ---------------------------------------------------------------------------

export interface Engine<TState> {
  run(
    workflow: Workflow<TState>,
    initialState: TState,
    hooks?: EngineHooks<TState>,
    options?: Partial<EngineOptions>,
  ): Promise<ExecutionResult<TState>>;
}

// ---------------------------------------------------------------------------
// WorkflowError
// ---------------------------------------------------------------------------

export type WorkflowErrorKind =
  | "MISSING_INITIAL_NODE"
  | "VISIT_LIMIT_EXCEEDED"
  | "VALIDATION_FAILED";

export class WorkflowError extends Error {
  constructor(
    public readonly kind: WorkflowErrorKind,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}
