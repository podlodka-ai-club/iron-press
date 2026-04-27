import { useState } from "react";
import { COMMON_TOOLS } from "../config/tools.js";

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
  display: "block",
};

const CHIP_BASE: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: 12,
  fontSize: 10,
  cursor: "pointer",
  transition: "all 0.15s",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

interface Props {
  label: string;
  selectedTools: string[];
  onChange: (tools: string[]) => void;
}

export function ToolSelector({ label, selectedTools, onChange }: Props) {
  const [customTool, setCustomTool] = useState("");

  function toggleTool(tool: string) {
    if (selectedTools.includes(tool)) {
      onChange(selectedTools.filter((t) => t !== tool));
    } else {
      onChange([...selectedTools, tool]);
    }
  }

  function addCustomTool(e: React.KeyboardEvent) {
    if (e.key === "Enter" && customTool.trim()) {
      e.preventDefault();
      if (!selectedTools.includes(customTool.trim())) {
        onChange([...selectedTools, customTool.trim()]);
      }
      setCustomTool("");
    }
  }

  const allTools = Array.from(new Set([...COMMON_TOOLS, ...selectedTools]));

  return (
    <div style={{ marginBottom: 16 }}>
      <span style={FIELD_LABEL}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {allTools.map((tool) => {
          const isSelected = selectedTools.includes(tool);
          return (
            <button
              key={tool}
              onClick={() => toggleTool(tool)}
              style={{
                ...CHIP_BASE,
                background: isSelected ? "rgba(56, 139, 253, 0.15)" : "#21262d",
                border: isSelected ? "1px solid #388bfd" : "1px solid #30363d",
                color: isSelected ? "#e6edf3" : "#8b949e",
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
