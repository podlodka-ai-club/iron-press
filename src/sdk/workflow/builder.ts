import { DirectedGraph } from "graphology";
import { logger } from "@/util/logger.js";
import type {
  EdgeAttributes,
  Node,
  NodeAttributes,
  NodeStatus,
  Workflow,
  WorkflowEdge,
} from "./contracts.js";
import { WorkflowError } from "./contracts.js";

export class WorkflowBuilder<TState> {
  private readonly _nodes = new Map<string, Node<TState>>();
  private readonly _edges: WorkflowEdge[] = [];
  private _initialNodeId: string | undefined;

  // ---------------------------------------------------------------------------
  // Fluent API
  // ---------------------------------------------------------------------------

  /** Add a processing node. Throws on duplicate id. */
  addNode(node: Node<TState>): this {
    if (this._nodes.has(node.id)) {
      throw new WorkflowError("VALIDATION_FAILED", `Duplicate node id "${node.id}"`, {
        nodeId: node.id,
      });
    }
    this._nodes.set(node.id, node);
    return this;
  }

  /**
   * Add a directed edge. `onStatus` may be a single value or an array — any
   * listed status from the source node triggers this edge.
   */
  addEdge(from: string, to: string, onStatus: NodeStatus | readonly NodeStatus[]): this {
    this._edges.push({ from, to, onStatus });
    return this;
  }

  /** Set the node id where execution begins. */
  setInitialNode(nodeId: string): this {
    this._initialNodeId = nodeId;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  /**
   * Validate the builder state and produce an immutable Workflow.
   * Throws WorkflowError on any structural problem.
   */
  build(): Workflow<TState> {
    this._validate();

    const graph = new DirectedGraph<NodeAttributes, EdgeAttributes>();

    for (const [id, node] of this._nodes) {
      graph.addNode(id, { node });
    }

    for (const edge of this._edges) {
      graph.addEdge(edge.from, edge.to, { onStatus: edge.onStatus });
    }

    return {
      graph,
      initialNodeId: this._initialNodeId as string,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal validation
  // ---------------------------------------------------------------------------

  private _validate(): void {
    // 1. initialNodeId must be set and exist
    if (this._initialNodeId === undefined) {
      throw new WorkflowError(
        "MISSING_INITIAL_NODE",
        "No initial node set — call setInitialNode()",
      );
    }
    if (!this._nodes.has(this._initialNodeId)) {
      throw new WorkflowError(
        "MISSING_INITIAL_NODE",
        `Initial node "${this._initialNodeId}" was not added`,
        { nodeId: this._initialNodeId },
      );
    }

    // 2. Edge referential integrity — both endpoints must exist
    for (const edge of this._edges) {
      if (!this._nodes.has(edge.from)) {
        throw new WorkflowError(
          "VALIDATION_FAILED",
          `Edge references unknown source node "${edge.from}"`,
          { from: edge.from, to: edge.to },
        );
      }
      if (!this._nodes.has(edge.to)) {
        throw new WorkflowError(
          "VALIDATION_FAILED",
          `Edge references unknown target node "${edge.to}"`,
          { from: edge.from, to: edge.to },
        );
      }
    }

    // 3. Reachability: BFS from initialNodeId (warning, not fatal)
    const reachable = new Set<string>();
    const queue: string[] = [this._initialNodeId as string];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const edge of this._edges) {
        if (edge.from === current && !reachable.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }
    for (const nodeId of this._nodes.keys()) {
      if (!reachable.has(nodeId)) {
        logger.warn(
          { nodeId, initialNodeId: this._initialNodeId },
          "workflow node is unreachable from the initial node",
        );
      }
    }
  }
}
