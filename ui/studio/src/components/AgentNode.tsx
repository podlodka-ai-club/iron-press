import { memo, useCallback, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { BuilderNodeData } from "../types.js";
import { useWorkflowStore } from "../store/workflowStore.js";
import {
  ROLE_COLORS,
  ROLE_COLOR_FALLBACK,
  STATUS_COLORS,
  NODE_RENDER_WIDTH,
  HANDLE_SIZE,
  HANDLE_HALF,
} from "../constants.js";

type AgentNodeType = Node<BuilderNodeData, "agentNode">;

// ─── STYLE HELPERS ──────────────────────────────────────────────────────────

const HUMAN_BACKGROUND =
  "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 10px, transparent 10px, transparent 20px)";

function nodeBg(selected: boolean) {
  return selected ? "#1c2333" : "#21262d";
}

function nodeHeaderBg(selected: boolean) {
  return selected ? "#182030" : "#161b22";
}

function nodeBorderColor(selected: boolean, hovered: boolean) {
  if (selected) return "#388bfd";
  if (hovered) return "rgba(88,166,255,0.35)";
  return "#30363d";
}

function nodeBoxShadow(selected: boolean, hovered: boolean) {
  if (selected) return "0 0 0 1px rgba(56,139,253,0.3), 0 4px 16px rgba(0,0,0,0.4)";
  if (hovered) return "0 2px 8px rgba(0,0,0,0.4)";
  return "0 1px 4px rgba(0,0,0,0.3)";
}

function outerStyle(
  selected: boolean,
  hovered: boolean,
  isInitial: boolean,
  isHuman: boolean,
): React.CSSProperties {
  const bg = nodeBg(selected);
  const borderColor = nodeBorderColor(selected, hovered);
  return {
    width: NODE_RENDER_WIDTH,
    background: bg,
    backgroundImage: isHuman ? HUMAN_BACKGROUND : "none",
    borderRadius: 8,
    overflow: "visible", // lets the WaitDecider diamond break out of bounds
    cursor: "pointer",
    borderTop: `1px solid ${borderColor}`,
    borderRight: `1px solid ${borderColor}`,
    borderBottom: `1px solid ${borderColor}`,
    borderLeft: isInitial ? "3px solid #3fb950" : selected ? "3px solid #388bfd" : `1px solid ${borderColor}`,
    boxShadow: nodeBoxShadow(selected, hovered),
    transition: "box-shadow 0.15s, border-color 0.15s, background 0.15s",
    display: "flex",
    flexDirection: "column",
  };
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

interface NodeHeaderProps {
  id: string;
  data: BuilderNodeData;
  roleColor: string;
  selected: boolean;
}

function NodeHeader({ id, data, roleColor, selected }: NodeHeaderProps) {
  const headerBg = nodeHeaderBg(selected);
  return (
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
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: roleColor, flexShrink: 0 }} />
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
      <span style={{ fontSize: 10, color: "#6e7681", fontFamily: "monospace", flexShrink: 0 }}>{id}</span>
    </div>
  );
}

interface NodeBodyProps {
  data: BuilderNodeData;
  isScript: boolean;
}

function NodeBody({ data, isScript }: NodeBodyProps) {
  if (isScript) {
    return (
      <div style={{ padding: "8px 12px 10px" }}>
        <div style={{ fontSize: 12, color: "#c9d1d9", fontStyle: "italic", textAlign: "center", marginTop: 8 }}>
          Script Execution
        </div>
      </div>
    );
  }

  return (
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
  );
}

interface NodeFooterProps {
  selected: boolean;
}

function NodeFooter({ selected }: NodeFooterProps) {
  const headerBg = nodeHeaderBg(selected);
  const handleBorder = `2px solid ${headerBg}`;
  return (
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
      <div
        style={{
          flex: 1,
          position: "relative",
          textAlign: "center",
          padding: "8px 0",
          borderRight: "1px solid #30363d",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS.Fail }}>Fail</span>
        <Handle
          title="Fail"
          type="source"
          id="Fail"
          position={Position.Bottom}
          style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, background: STATUS_COLORS.Fail, border: handleBorder, bottom: -HANDLE_HALF }}
        />
      </div>

      <div style={{ flex: 1, position: "relative", textAlign: "center", padding: "8px 0" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS.Pass }}>Pass</span>
        <Handle
          title="Pass"
          type="source"
          id="Pass"
          position={Position.Bottom}
          style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, background: STATUS_COLORS.Pass, border: handleBorder, bottom: -HANDLE_HALF }}
        />
      </div>

      <WaitDecider />
    </div>
  );
}

function WaitDecider() {
  // A rotated diamond that acts as the WaitUserInput source handle.
  // Positioned absolutely to break out of the footer's top-right corner.
  return (
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
          transform: "rotate(-45deg)", // counter-rotates the hitbox back to square
          cursor: "crosshair",
        }}
      />
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

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

  const roleColor = ROLE_COLORS[data.role] ?? ROLE_COLOR_FALLBACK;
  const isHuman = data.role === "human";
  const isScript = data.role === "worktree-script";

  return (
    <div
      style={outerStyle(selected, hovered, data.isInitial, isHuman)}
      onClick={() => setSelectedNode(id)}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: "#8b949e",
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          left: -HANDLE_HALF,
          border: `2px solid ${nodeBg(selected)}`,
        }}
      />
      <NodeHeader id={id} data={data} roleColor={roleColor} selected={selected} />
      <NodeBody data={data} isScript={isScript} />
      <NodeFooter selected={selected} />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
