import dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";
import type { Node } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 120;

// Generic so callers preserve their node data type through the layout pass
export function layoutNodes<T extends Node>(nodes: T[], edges: Edge[], direction: "TB" | "LR" = "TB"): T[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: direction, ranksep: 120, nodesep: 80 });
  g.setDefaultNodeLabel(() => ({}));
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id) as { x: number; y: number } | undefined;
    if (!pos) return node;
    return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}
