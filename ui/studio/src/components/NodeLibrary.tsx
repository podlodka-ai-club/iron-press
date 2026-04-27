import type { AgentTypeInfo, WorkflowBundle } from "../types.js";
import { useWorkflowStore } from "../store/workflowStore.js";
import { ROLE_COLORS, ROLE_COLOR_FALLBACK } from "../constants.js";

interface Props {
  agentTypes: AgentTypeInfo[];
  workflows: WorkflowBundle[];
}

const SECTION_HEADER: React.CSSProperties = {
  padding: "10px 14px 6px",
  fontSize: 10,
  fontWeight: 600,
  color: "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export function NodeLibrary({ agentTypes, workflows }: Props) {
  const addNodeFromPalette = useWorkflowStore((s) => s.addNodeFromPalette);
  const addNodesFromTemplate = useWorkflowStore((s) => s.addNodesFromTemplate);

  function onAgentDragStart(e: React.DragEvent, role: string) {
    e.dataTransfer.setData("application/agent-role", role);
    e.dataTransfer.effectAllowed = "copy";
  }

  function onAgentClick(agentType: AgentTypeInfo) {
    const nodeCount = useWorkflowStore.getState().nodes.length;
    addNodeFromPalette(agentType, { x: 80 + nodeCount * 260, y: 120 });
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
      <div style={SECTION_HEADER}>Agents</div>
      <div style={{ padding: "0 8px 8px" }}>
        {agentTypes.map((a) => (
          <div
            key={a.role}
            draggable
            className="library-card library-card-agent"
            onClick={() => onAgentClick(a)}
            onDragStart={(e) => onAgentDragStart(e, a.role)}
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

      {workflows.length > 0 && (
        <>
          <div
            style={{
              ...SECTION_HEADER,
              borderTop: "1px solid #21262d",
              paddingTop: 12,
            }}
          >
            Templates
          </div>
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
