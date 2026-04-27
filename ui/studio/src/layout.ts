import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import { NODE_LAYOUT_WIDTH, NODE_LAYOUT_HEIGHT } from "./constants.js";

// Generic so callers preserve their node data type through the layout pass
export function layoutNodes<T extends Node>(nodes: T[], edges: Edge[], direction: "TB" | "LR" = "LR"): T[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: direction, ranksep: 200, nodesep: 120 });
  g.setDefaultNodeLabel(() => ({}));
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_LAYOUT_WIDTH, height: NODE_LAYOUT_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id) as { x: number; y: number } | undefined;
    if (!pos) return node;
    return { ...node, position: { x: pos.x - NODE_LAYOUT_WIDTH / 2, y: pos.y - NODE_LAYOUT_HEIGHT / 2 } };
  });
}
