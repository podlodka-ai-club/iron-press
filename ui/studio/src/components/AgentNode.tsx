import { memo, useCallback, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { BuilderNodeData, NodeStatus } from "../types.js";
import { useWorkflowStore } from "../store/workflowStore.js";

type AgentNodeType = Node<BuilderNodeData, "agentNode">;

const ROLE_COLORS: Record<string, string> = {
  "business-analyst": "#e3b341",
  engineer: "#f0883e",
  "tech-lead": "#388bfd",
  "product-owner": "#a371f7",
  "pull-request": "#3fb950",
};

const STATUS_HANDLES: NodeStatus[] = ["Pass", "Fail", "WaitUserInput"];
const STATUS_COLORS: Record<NodeStatus, string> = {
  Pass: "#3fb950",
  Fail: "#f85149",
  WaitUserInput: "#d29922",
};
const STATUS_LABELS: Record<NodeStatus, string> = {
  Pass: "Pass",
  Fail: "Fail",
  WaitUserInput: "Wait",
};

function AgentNodeComponent({ id, data, selected }: NodeProps<AgentNodeType>) {
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const setInitialNode = useWorkflowStore((s) => s.setInitialNode);
  const [hovered, setHovered] = useState(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setInitialNode(id);
    },
    [id, setInitialNode],
  );

  const roleColor = ROLE_COLORS[data.role] ?? "#8b949e";

  const borderColor = selected
    ? "#388bfd"
    : hovered
    ? "rgba(88,166,255,0.35)"
    : "#30363d";

  const bg = selected ? "#1c2333" : "#21262d";
  const headerBg = selected ? "#182030" : "#161b22";

  return (
    <div
      onClick={() => setSelectedNode(id)}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 240,
        background: bg,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: data.isInitial
          ? "3px solid #3fb950"
          : selected
          ? "3px solid #388bfd"
          : `1px solid ${borderColor}`,
        boxShadow: selected
          ? "0 0 0 1px rgba(56,139,253,0.3), 0 4px 16px rgba(0,0,0,0.4)"
          : hovered
          ? "0 2px 8px rgba(0,0,0,0.4)"
          : "0 1px 4px rgba(0,0,0,0.3)",
        transition: "box-shadow 0.15s, border-color 0.15s, background 0.15s",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#8b949e",
          width: 10,
          height: 10,
          border: "2px solid #21262d",
        }}
      />

      {/* Header */}
      <div
        style={{
          background: headerBg,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #30363d",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: roleColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#e6edf3",
            flexGrow: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {data.label}
        </span>
        {data.isInitial && (
          <span style={{ fontSize: 10, color: "#3fb950", fontWeight: 700, flexShrink: 0 }}>▶</span>
        )}
        <span style={{ fontSize: 10, color: "#6e7681", fontFamily: "monospace", flexShrink: 0 }}>
          {id}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "8px 12px 10px" }}>
        <div style={{ fontSize: 12, color: "#c9d1d9", marginBottom: 2 }}>{data.model}</div>
        <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 8 }}>
          {data.maxTurns} turns · ${data.budgetUsd}
        </div>
        <span
          style={{
            display: "inline-block",
            padding: "2px 7px",
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 12,
            fontSize: 10,
            fontWeight: 500,
            color: data.permissionProfile === "view-only" ? "#8b949e" : "#3fb950",
            letterSpacing: "0.02em",
          }}
        >
          {data.permissionProfile}
        </span>
      </div>

      {/* Source handles */}
      <div
        style={{
          display: "flex",
          borderTop: "1px solid #30363d",
          background: headerBg,
        }}
      >
        {STATUS_HANDLES.map((status, i) => (
          <div
            key={status}
            style={{
              flex: 1,
              position: "relative",
              textAlign: "center",
              padding: "5px 0 7px",
              borderRight: i < STATUS_HANDLES.length - 1 ? "1px solid #30363d" : "none",
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: STATUS_COLORS[status],
                fontWeight: 600,
                marginBottom: 3,
                letterSpacing: "0.03em",
              }}
            >
              {STATUS_LABELS[status]}
            </div>
            <Handle
              type="source"
              id={status}
              position={Position.Bottom}
              title={`Drag to connect on ${status}`}
              style={{
                position: "relative",
                transform: "none",
                left: "auto",
                bottom: "auto",
                top: "auto",
                right: "auto",
                display: "block",
                margin: "0 auto",
                width: 10,
                height: 10,
                background: STATUS_COLORS[status],
                border: `2px solid ${headerBg}`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
