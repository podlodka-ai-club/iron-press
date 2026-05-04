import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { NodeStatus } from "../types.js";
import { STATUS_COLORS, STATUS_COLOR_FALLBACK } from "../constants.js";

interface StatusEdgeData extends Record<string, unknown> {
  onStatus: NodeStatus;
  sourceRole?: string;
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
  const status = data?.onStatus ?? "Pass";
  const isWait = status === "WaitUserInput";
  
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const color = STATUS_COLORS[status] ?? STATUS_COLOR_FALLBACK;

  return (
    <>
      <BaseEdge 
        id={id} 
        path={edgePath} 
        style={{ 
          stroke: "#8b949e", 
          strokeWidth: 2,
        }} 
      />
    </>
  );
}
