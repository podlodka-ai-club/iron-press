import { useState } from "react";
import { useWorkflowStore } from "../store/workflowStore.js";

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 8,
};

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
  display: "block",
};

const HR: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #21262d",
  margin: "14px 0",
};

const COMMON_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "WebFetch",
  "Edit",
  "Write",
  "Bash",
  "NotebookEdit",
  "mcp__linear__*",
  "mcp__plugin_figma_figma__*"
];

function ToolSelector({ 
  label, 
  selectedTools, 
  onChange 
}: { 
  label: string; 
  selectedTools: string[]; 
  onChange: (tools: string[]) => void 
}) {
  const [customTool, setCustomTool] = useState("");

  const toggleTool = (tool: string) => {
    if (selectedTools.includes(tool)) {
      onChange(selectedTools.filter(t => t !== tool));
    } else {
      onChange([...selectedTools, tool]);
    }
  };

  const addCustomTool = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && customTool.trim()) {
      e.preventDefault();
      if (!selectedTools.includes(customTool.trim())) {
        onChange([...selectedTools, customTool.trim()]);
      }
      setCustomTool("");
    }
  };

  // Merge common tools and any custom tools already selected
  const allTools = Array.from(new Set([...COMMON_TOOLS, ...selectedTools]));

  return (
    <div style={{ marginBottom: 16 }}>
      <span style={FIELD_LABEL}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {allTools.map(tool => {
          const isSelected = selectedTools.includes(tool);
          return (
            <button
              key={tool}
              onClick={() => toggleTool(tool)}
              style={{
                background: isSelected ? "rgba(56, 139, 253, 0.15)" : "#21262d",
                border: isSelected ? "1px solid #388bfd" : "1px solid #30363d",
                color: isSelected ? "#e6edf3" : "#8b949e",
                padding: "3px 8px",
                borderRadius: 12,
                fontSize: 10,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "inline-flex",
                alignItems: "center",
                gap: 4
              }}
            >
              {isSelected && <span style={{ fontSize: 8, color: "#388bfd" }}>✓</span>}
              {tool}
            </button>
          );
        })}
      </div>
      <input
        className="studio-input"
        type="text"
        placeholder="Add custom tool + Enter"
        value={customTool}
        onChange={(e) => setCustomTool(e.target.value)}
        onKeyDown={addCustomTool}
        style={{ fontSize: 11, padding: "6px 8px" }}
      />
    </div>
  );
}

export function Inspector() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const setInitialNode = useWorkflowStore((s) => s.setInitialNode);
  const [copied, setCopied] = useState(false);

  const node = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  const containerStyle: React.CSSProperties = {
    width: 300,
    flexShrink: 0,
    background: "#161b22",
    borderLeft: "1px solid #21262d",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  };

  if (!node) {
    return (
      <aside style={containerStyle}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            padding: 24,
            color: "#6e7681",
            fontSize: 12,
            textAlign: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 20 }}>☰</span>
          <span>Select a node to inspect</span>
        </div>
      </aside>
    );
  }

  const { data } = node;

  function handleCopy() {
    void navigator.clipboard.writeText(data.skillContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <aside style={containerStyle}>
      {/* Header */}
      <div
        style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          Inspector
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>{data.label}</div>
        <div style={{ fontSize: 10, color: "#6e7681", fontFamily: "monospace", marginTop: 2 }}>{node.id}</div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px", flex: 1 }}>
        {/* Start node toggle */}
        <button
          className={`inspector-start-btn${data.isInitial ? " is-initial" : ""}`}
          onClick={() => !data.isInitial && setInitialNode(node.id)}
          disabled={data.isInitial}
        >
          <span>{data.isInitial ? "▶" : "○"}</span>
          <span>{data.isInitial ? "Start node" : "Set as start node"}</span>
        </button>

        <hr style={HR} />

        {/* Config section */}
        <div style={SECTION_LABEL}>Config</div>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>Name</span>
          <input
            className="studio-input"
            type="text"
            value={data.label}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>Model</span>
          <input
            className="studio-input"
            type="text"
            value={data.model}
            onChange={(e) => updateNodeData(node.id, { model: e.target.value })}
          />
        </label>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <label style={{ flex: 1 }}>
            <span style={FIELD_LABEL}>Max Turns</span>
            <input
              className="studio-input"
              type="number"
              min={1}
              value={data.maxTurns}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n > 0) updateNodeData(node.id, { maxTurns: n });
              }}
            />
          </label>
          <label style={{ flex: 1 }}>
            <span style={FIELD_LABEL}>Budget ($)</span>
            <input
              className="studio-input"
              type="number"
              min={0.1}
              step={0.5}
              value={data.budgetUsd}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (!isNaN(n) && n > 0) updateNodeData(node.id, { budgetUsd: n });
              }}
            />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>Permission Profile</span>
          <select
            className="studio-select"
            value={data.permissionProfile}
            onChange={(e) => updateNodeData(node.id, { permissionProfile: e.target.value })}
          >
            <option value="view-only">view-only</option>
            <option value="safe-write">safe-write</option>
          </select>
        </label>

        <hr style={HR} />

        {/* Tools section */}
        <div style={SECTION_LABEL}>Tools</div>

        <ToolSelector 
          label="Allowed Tools" 
          selectedTools={data.allowedTools} 
          onChange={(tools) => updateNodeData(node.id, { allowedTools: tools })} 
        />

        <ToolSelector 
          label="Disallowed Tools" 
          selectedTools={data.disallowedTools} 
          onChange={(tools) => updateNodeData(node.id, { disallowedTools: tools })} 
        />

        <hr style={HR} />

        {/* Prompt section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span style={SECTION_LABEL}>Skill Prompt</span>
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <pre
          style={{
            background: "#0d1117",
            border: "1px solid #21262d",
            borderRadius: 6,
            padding: "10px 12px",
            color: "#8b949e",
            fontSize: 11,
            lineHeight: 1.5,
            overflowX: "auto",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 240,
            margin: 0,
            fontFamily: '"SFMono-Regular", "Consolas", "Liberation Mono", monospace',
          }}
        >
          {data.skillContent || "(no prompt)"}
        </pre>
      </div>
    </aside>
  );
}
