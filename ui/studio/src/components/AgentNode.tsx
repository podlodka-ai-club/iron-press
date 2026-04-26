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
  human: "#ff7b72",
  "worktree-script": "#8957e5",
};

const STATUS_COLORS: Record<NodeStatus, string> = {
  Pass: "#3fb950",
  Fail: "#f85149",
  WaitUserInput: "#8b949e",
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
  const borderColor = selected ? "#388bfd" : hovered ? "rgba(88,166,255,0.35)" : "#30363d";
  const bg = selected ? "#1c2333" : "#21262d";
  const headerBg = selected ? "#182030" : "#161b22";

  const isHuman = data.role === "human";
  const isScript = data.role === "worktree-script";

  return (
    <div
      onClick={() => setSelectedNode(id)}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 240,
        background: bg,
        backgroundImage: isHuman
          ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 10px, transparent 10px, transparent 20px)"
          : "none",
        borderRadius: 8,
        overflow: "visible", // Allow the decider diamond to break out
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
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "#8b949e",
          width: 14,
          height: 14,
          left: -7,
          border: `2px solid ${bg}`,
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
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
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
        {!isScript && (
          <>
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
          </>
        )}
        {isScript && (
          <div style={{ fontSize: 12, color: "#c9d1d9", fontStyle: "italic", textAlign: "center", marginTop: 8 }}>
            Script Execution
          </div>
        )}
      </div>

      {/* Clean Footer Handles */}
      <div
        style={{
          display: "flex",
          borderTop: "1px solid #30363d",
          background: headerBg,
          position: "relative",
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
        }}
      >
        <div style={{ flex: 1, position: "relative", textAlign: "center", padding: "8px 0", borderRight: "1px solid #30363d" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS.Fail }}>Fail</span>
          <Handle
            title="Fail"
            type="source"
            id="Fail"
            position={Position.Bottom}
            style={{ width: 14, height: 14, background: STATUS_COLORS.Fail, border: `2px solid ${headerBg}`, bottom: -7 }}
          />
        </div>

        <div style={{ flex: 1, position: "relative", textAlign: "center", padding: "8px 0" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS.Pass }}>Pass</span>
          <Handle
            title="Pass"
            type="source"
            id="Pass"
            position={Position.Bottom}
            style={{ width: 14, height: 14, background: STATUS_COLORS.Pass, border: `2px solid ${headerBg}`, bottom: -7 }}
          />
        </div>

        {/* The Decider / WaitUserInput Attachment */}
        <div
          title="Decider (WaitUserInput)"
          style={{
            position: "absolute",
            right: -16,
            top: -16,
            width: 32,
            height: 32,
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px dashed #6e7681",
            transform: "rotate(45deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            zIndex: 10,
          }}
        >
          <div style={{ width: 8, height: 8, background: "#8b949e", borderRadius: "50%" }} />
          <Handle
            type="source"
            id="WaitUserInput"
            position={Position.Right}
            style={{
              opacity: 0,
              width: 32,
              height: 32,
              transform: "rotate(-45deg)", // Counter-rotate the hitbox
              cursor: "crosshair",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
