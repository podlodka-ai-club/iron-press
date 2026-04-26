import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { NodeStatus } from "../types.js";

const STATUS_COLORS: Record<NodeStatus, string> = {
  Pass: "#3fb950",
  Fail: "#f85149",
  WaitUserInput: "#d29922",
};

interface StatusEdgeData extends Record<string, unknown> {
  onStatus: NodeStatus;
}

type StatusEdgeType = Edge<StatusEdgeData, "statusEdge">;

export function StatusEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<StatusEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const status = data?.onStatus ?? "Pass";
  const color = STATUS_COLORS[status] ?? "#a0aec0";

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: color, strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: "#161b22",
            border: `1px solid ${color}`,
            color,
            padding: "2px 7px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            pointerEvents: "none",
          }}
        >
          {status === "WaitUserInput" ? "Wait" : status}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
