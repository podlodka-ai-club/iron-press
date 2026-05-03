import { useEffect, useState } from "react";
import type { AgentTypeInfo, WorkflowBundle } from "../types.js";
import { useWorkflowStore } from "../store/workflowStore.js";
import { ROLE_COLORS, ROLE_COLOR_FALLBACK } from "../constants.js";
import { fetchAgents } from "../api.js";

interface Props {
  workflows: WorkflowBundle[];
}

// Hardcoded blank structural types — give a clean canvas with no pre-filled config
const PRIMITIVES: AgentTypeInfo[] = [
  {
    role: "agent",
    label: "Agent",
    color: ROLE_COLOR_FALLBACK,
    defaultNodeId: "agent",
    defaultSkill: "",
    defaultConfig: {
      model: "claude-haiku-4-5",
      maxTurns: 30,
      budgetUsd: 2,
      allowedTools: [],
      disallowedTools: [],
      permissionProfile: "view-only",
    },
    nodeType: "agent",
  },
  {
    role: "worktree-script",
    label: "Git: Worktree",
    color: "#8957e5",
    defaultNodeId: "worktree",
    defaultSkill: "",
    defaultConfig: {
      model: "script",
      maxTurns: 1,
      budgetUsd: 0.1,
      allowedTools: [],
      disallowedTools: [],
      permissionProfile: "safe-write",
    },
    nodeType: "script",
    scriptKind: "worktree",
  },
  {
    role: "create-branch-script",
    label: "Git: Create Branch",
    color: "#3fb950",
    defaultNodeId: "create-branch",
    defaultSkill: "",
    defaultConfig: {
      model: "script",
      maxTurns: 1,
      budgetUsd: 0.1,
      allowedTools: [],
      disallowedTools: [],
      permissionProfile: "safe-write",
    },
    nodeType: "script",
    scriptKind: "create-branch",
  },
  {
    role: "pull-request-script",
    label: "Git: Pull Request",
    color: "#3fb950",
    defaultNodeId: "pull-request",
    defaultSkill: "",
    defaultConfig: {
      model: "script",
      maxTurns: 1,
      budgetUsd: 0.1,
      allowedTools: [],
      disallowedTools: [],
      permissionProfile: "safe-write",
    },
    nodeType: "script",
    scriptKind: "pull-request",
  },
];

const SECTION_HEADER: React.CSSProperties = {
  padding: "10px 14px 6px",
  fontSize: 10,
  fontWeight: 600,
  color: "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const DIVIDER: React.CSSProperties = {
  borderTop: "1px solid #21262d",
  paddingTop: 12,
};

export function NodeLibrary({ workflows }: Props) {
  const addNodeFromPalette = useWorkflowStore((s) => s.addNodeFromPalette);
  const addNodesFromTemplate = useWorkflowStore((s) => s.addNodesFromTemplate);
  const [presets, setPresets] = useState<AgentTypeInfo[]>([]);

  useEffect(() => {
    fetchAgents()
      .then((agents) =>
        setPresets(
          agents.map((a) => ({
            role: a.role,
            label: a.label,
            color: a.color,
            defaultNodeId: a.defaultNodeId,
            defaultSkill: a.defaultSkill,
            defaultConfig: a.defaultConfig,
            nodeType: a.nodeType,
            scriptKind: a.scriptKind,
            defaultPassCheckRef: a.defaultPassCheckRef,
            builtin: a.builtin,
          })),
        ),
      )
      .catch(console.error);
  }, []);

  function addNode(agentType: AgentTypeInfo) {
    const nodeCount = useWorkflowStore.getState().nodes.length;
    addNodeFromPalette(agentType, { x: 80 + nodeCount * 260, y: 120 });
  }

  function onPresetDragStart(e: React.DragEvent, role: string) {
    e.dataTransfer.setData("application/agent-role", role);
    e.dataTransfer.effectAllowed = "copy";
  }

  function onTemplateClick(bundle: WorkflowBundle) {
    const nodeCount = useWorkflowStore.getState().nodes.length;
    addNodesFromTemplate(bundle, { x: 80, y: 80 + nodeCount * 160 });
  }

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        background: "#161b22",
        borderRight: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Section A — Primitives */}
      <div style={SECTION_HEADER}>Add Node</div>
      <div style={{ padding: "0 8px 8px" }}>
        {PRIMITIVES.map((p) => {
          const isScript = p.nodeType === "script";
          return (
            <div
              key={`primitive-${p.role}-${p.scriptKind ?? ""}`}
              className="library-card library-card-agent"
              onClick={() => addNode(p)}
              title={`Add blank ${p.label} node`}
              style={{ cursor: "pointer" }}
            >
              <span style={{ fontSize: 12, flexShrink: 0, color: "#6e7681" }}>
                {isScript ? "⚙" : "○"}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "#c9d1d9" }}>{p.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#6e7681" }}>+</span>
            </div>
          );
        })}
      </div>

      {/* Section B — Presets */}
      {presets.length > 0 && (
        <>
          <div style={{ ...SECTION_HEADER, ...DIVIDER }}>Presets</div>
          <div style={{ padding: "0 8px 8px" }}>
            {presets.map((a) => (
              <div
                key={a.role}
                draggable
                className="library-card library-card-agent"
                onClick={() => addNode(a)}
                onDragStart={(e) => onPresetDragStart(e, a.role)}
                title="Click or drag to add to canvas"
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: ROLE_COLORS[a.role] ?? ROLE_COLOR_FALLBACK,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: "#c9d1d9" }}>{a.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#6e7681" }}>+</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Section C — Workflow Templates */}
      {workflows.length > 0 && (
        <>
          <div style={{ ...SECTION_HEADER, ...DIVIDER }}>Templates</div>
          <div style={{ padding: "0 8px 8px" }}>
            {workflows.map((wf) => (
              <div
                key={wf.name}
                className="library-card library-card-template"
                onClick={() => onTemplateClick(wf)}
                title="Click to load template nodes onto canvas"
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: "#c9d1d9" }}>{wf.name}</div>
                <div style={{ fontSize: 10, color: "#6e7681", marginTop: 2 }}>
                  {wf.definition.nodes.length} nodes · {wf.definition.edges.length} edges
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
