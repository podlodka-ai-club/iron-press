import { randomUUID } from "node:crypto";
import { logger } from "../util/logger.js";
import type {
  Engine,
  EngineHooks,
  EngineOptions,
  ExecutionContext,
  ExecutionResult,
  HistoryEntry,
  Node,
  NodeContext,
  Workflow,
} from "./contracts.js";
import { EngineOptionsSchema, WorkflowError } from "./contracts.js";

export class GraphologyEngine<TState> implements Engine<TState> {
  async run(
    workflow: Workflow<TState>,
    initialState: TState,
    hooks: EngineHooks<TState> = {},
    options: Partial<EngineOptions> = {},
  ): Promise<ExecutionResult<TState>> {
    const opts = EngineOptionsSchema.parse(options);
    const runId = opts.runId ?? randomUUID();
    const startedAt = new Date().toISOString();

    if (!workflow.graph.hasNode(workflow.initialNodeId)) {
      throw new WorkflowError(
        "MISSING_INITIAL_NODE",
        `Initial node "${workflow.initialNodeId}" not found in graph`,
        { nodeId: workflow.initialNodeId },
      );
    }

    const visitCounts: Record<string, number> = {};
    const history: HistoryEntry[] = [];
    const state = initialState; // mutable — handlers write to this directly

    let currentNodeId = workflow.initialNodeId;

    const execCtx: ExecutionContext = {
      runId,
      currentNodeId,
      visitCounts: {},
      startedAt,
    };

    logger.info({ runId, initialNodeId: workflow.initialNodeId }, "workflow run started");

    // -------------------------------------------------------------------------
    // Main execution loop
    // -------------------------------------------------------------------------
    while (true) {
      const visits = visitCounts[currentNodeId] ?? 0;

      if (visits >= opts.maxVisitsPerNode) {
        throw new WorkflowError(
          "VISIT_LIMIT_EXCEEDED",
          `Node "${currentNodeId}" visited ${visits} times (limit=${opts.maxVisitsPerNode}). Possible cycle.`,
          { nodeId: currentNodeId, visitCount: visits, limit: opts.maxVisitsPerNode },
        );
      }

      visitCounts[currentNodeId] = visits + 1;
      execCtx.currentNodeId = currentNodeId;
      execCtx.visitCounts = { ...visitCounts };

      const { node } = workflow.graph.getNodeAttributes(currentNodeId) as {
        node: Node<TState>;
      };

      const nodeCtx: NodeContext<TState> = {
        state,
        nodeId: currentNodeId,
        visitCount: visits,
      };

      const enteredAt = new Date().toISOString();

      // Node-level onEnter
      if (node.onEnter) {
        await node.onEnter(nodeCtx);
      }

      // Engine-level onNodeEnter
      if (hooks.onNodeEnter) {
        await hooks.onNodeEnter(currentNodeId, { ...execCtx }, state);
      }

      logger.debug(
        { runId, nodeId: currentNodeId, nodeName: node.name, visitIndex: visits },
        "executing node",
      );

      // Execute
      const { status } = await node.execute(nodeCtx);

      const exitedAt = new Date().toISOString();

      history.push({ nodeId: currentNodeId, nodeName: node.name, status, enteredAt, exitedAt, visitIndex: visits });

      logger.debug({ runId, nodeId: currentNodeId, status }, "node completed");

      // Node-level onExit
      if (node.onExit) {
        await node.onExit(nodeCtx, status);
      }

      // Engine-level onNodeExit
      if (hooks.onNodeExit) {
        await hooks.onNodeExit(currentNodeId, status, { ...execCtx }, state);
      }

      // WaitUserInput — suspend immediately
      if (status === "WaitUserInput") {
        logger.info({ runId, nodeId: currentNodeId }, "WaitUserInput — run suspended");
        const result = this._buildResult(state, status, "terminal-status", history, visitCounts, startedAt);
        if (hooks.onTerminate) await hooks.onTerminate(result);
        return result;
      }

      // Find matching outgoing edge (Pass or Fail)
      const outEdges = workflow.graph.outEdges(currentNodeId);
      let nextNodeId: string | undefined;

      for (const edgeKey of outEdges) {
        const edgeAttrs = workflow.graph.getEdgeAttributes(edgeKey);
        const triggers = Array.isArray(edgeAttrs.onStatus)
          ? edgeAttrs.onStatus
          : [edgeAttrs.onStatus];

        if (triggers.includes(status)) {
          nextNodeId = workflow.graph.target(edgeKey);
          break;
        }
      }

      // No matching edge — natural end
      if (nextNodeId === undefined) {
        logger.info(
          { runId, nodeId: currentNodeId, status, outEdgeCount: outEdges.length },
          "no matching outgoing edge — run ended",
        );
        const result = this._buildResult(state, status, "no-matching-edge", history, visitCounts, startedAt);
        if (hooks.onTerminate) await hooks.onTerminate(result);
        return result;
      }

      // Transition
      const previousNodeId = currentNodeId;
      execCtx.previousNodeId = previousNodeId;
      execCtx.lastStatus = status;

      if (hooks.onTransition) {
        await hooks.onTransition(previousNodeId, nextNodeId, status, { ...execCtx });
      }

      logger.debug({ runId, from: previousNodeId, to: nextNodeId, status }, "transition");

      currentNodeId = nextNodeId;
    }
  }

  private _buildResult(
    state: TState,
    finalStatus: ExecutionResult<TState>["finalStatus"],
    exitReason: ExecutionResult<TState>["exitReason"],
    history: HistoryEntry[],
    visitCounts: Record<string, number>,
    startedAt: string,
  ): ExecutionResult<TState> {
    return {
      finalStatus,
      exitReason,
      finalState: state,
      history,
      visitCounts: { ...visitCounts },
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}
