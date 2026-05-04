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

type ScriptNodeType = Node<BuilderNodeData, "scriptNode">;

const SCRIPT_KIND_LABELS: Record<string, string> = {
  worktree: "git worktree",
  "create-branch": "git branch",
  "pull-request": "git PR",
};

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

function scriptConfigSummary(data: BuilderNodeData): string | null {
  if (!data.scriptConfig) return null;
  if (data.scriptKind === "create-branch") {
    const prefix = (data.scriptConfig["branchPrefix"] as string | undefined) ?? "issue-";
    return `prefix: ${prefix}`;
  }
  if (data.scriptKind === "pull-request") {
    const base = (data.scriptConfig["baseBranch"] as string | undefined) ?? "main";
    return `base: ${base}`;
  }
  return null;
}

function ScriptNodeComponent({ id, data, selected }: NodeProps<ScriptNodeType>) {
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
  const kindLabel = data.scriptKind ? (SCRIPT_KIND_LABELS[data.scriptKind] ?? data.scriptKind) : "script";
  const borderColor = nodeBorderColor(selected, hovered);
  const passCheckLabel = data.passCheckRef ? data.passCheckRef.split(".")[0] : null;
  const configSummary = scriptConfigSummary(data);
  const headerBg = nodeHeaderBg(selected);

  return (
    <div
      style={{
        width: NODE_RENDER_WIDTH,
        background: nodeBg(selected),
        borderRadius: 8,
        overflow: "visible",
        cursor: "pointer",
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: data.isInitial ? "3px solid #3fb950" : selected ? "3px solid #388bfd" : `1px solid ${borderColor}`,
        boxShadow: nodeBoxShadow(selected, hovered),
        transition: "box-shadow 0.15s, border-color 0.15s, background 0.15s",
        display: "flex",
        flexDirection: "column",
      }}
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
      <Handle
        title="Next"
        type="source"
        id="Pass"
        position={Position.Right}
        style={{
          background: "#8b949e",
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          right: -HANDLE_HALF,
          border: `2px solid ${nodeBg(selected)}`,
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
        <span style={{ fontSize: 12, flexShrink: 0 }}>⚙</span>
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

      {/* Body */}
      <div style={{ padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        {passCheckLabel && (
          <div style={{ background: "rgba(56, 139, 253, 0.1)", padding: "4px 8px", borderRadius: 4, fontSize: 10, color: "#79c0ff", border: "1px solid rgba(56, 139, 253, 0.3)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#388bfd" }}>✓</span> {passCheckLabel}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 10,
              color: "#8957e5",
              background: "rgba(137,87,229,0.12)",
              border: "1px solid rgba(137,87,229,0.3)",
              borderRadius: 10,
              padding: "2px 7px",
              fontFamily: "monospace",
              letterSpacing: "0.03em",
            }}
          >
            {kindLabel}
          </span>
          {configSummary && (
            <span style={{ fontSize: 10, color: "#8b949e", fontFamily: "monospace" }}>{configSummary}</span>
          )}
        </div>
      </div>


    </div>
  );
}

export const ScriptNode = memo(ScriptNodeComponent);
