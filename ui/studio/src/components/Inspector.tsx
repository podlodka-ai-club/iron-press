import { useEffect, useState } from "react";
import { useWorkflowStore } from "../store/workflowStore.js";
import { ToolSelector } from "./ToolSelector.js";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard.js";
import { fetchConfig, type StudioConfig } from "../api.js";

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

const CONTAINER: React.CSSProperties = {
  width: 300,
  flexShrink: 0,
  background: "#161b22",
  borderLeft: "1px solid #21262d",
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
};

function EmptyState() {
  return (
    <aside style={CONTAINER}>
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

const NODE_TYPE_LABELS: Record<string, string> = {
  agent: "Agent",
  "script/worktree": "Git: Worktree",
  "script/create-branch": "Git: Create Branch",
  "script/pull-request": "Git: Pull Request",
};

function nodeTypeLabel(nodeType: string | undefined, scriptKind: string | undefined): string {
  if (nodeType === "script" && scriptKind) return NODE_TYPE_LABELS[`script/${scriptKind}`] ?? `Script (${scriptKind})`;
  return NODE_TYPE_LABELS[nodeType ?? "agent"] ?? "Agent";
}

interface ScriptConfigFieldsProps {
  scriptKind: string;
  scriptConfig: Record<string, unknown> | undefined;
  ro: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}

function ScriptConfigFields({ scriptKind, scriptConfig, ro, onChange }: ScriptConfigFieldsProps) {
  function field(key: string): string {
    return (scriptConfig?.[key] as string | undefined) ?? "";
  }
  function update(key: string, value: string) {
    onChange({ ...scriptConfig, [key]: value || undefined });
  }

  if (scriptKind === "worktree") {
    return (
      <div style={{ fontSize: 11, color: "#6e7681", padding: "6px 0" }}>
        Worktree path is derived from workflow state automatically. No configuration required.
      </div>
    );
  }

  if (scriptKind === "create-branch") {
    return (
      <>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>Branch Prefix</span>
          <input
            className="studio-input"
            type="text"
            placeholder="issue-"
            value={field("branchPrefix")}
            disabled={ro}
            onChange={(e) => update("branchPrefix", e.target.value)}
          />
        </label>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>State Key</span>
          <input
            className="studio-input"
            type="text"
            placeholder="branch"
            value={field("stateKey")}
            disabled={ro}
            onChange={(e) => update("stateKey", e.target.value)}
          />
          <span style={{ fontSize: 10, color: "#6e7681", display: "block", marginTop: 3 }}>
            Workflow state property where branch name is stored
          </span>
        </label>
      </>
    );
  }

  if (scriptKind === "pull-request") {
    return (
      <>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>Base Branch</span>
          <input
            className="studio-input"
            type="text"
            placeholder="main"
            value={field("baseBranch")}
            disabled={ro}
            onChange={(e) => update("baseBranch", e.target.value)}
          />
        </label>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>Branch State Key</span>
          <input
            className="studio-input"
            type="text"
            placeholder="branch"
            value={field("branchStateKey")}
            disabled={ro}
            onChange={(e) => update("branchStateKey", e.target.value)}
          />
          <span style={{ fontSize: 10, color: "#6e7681", display: "block", marginTop: 3 }}>
            Workflow state property to read the branch name from
          </span>
        </label>
      </>
    );
  }

  return null;
}

export function Inspector() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const setInitialNode = useWorkflowStore((s) => s.setInitialNode);
  const isReadOnly = useWorkflowStore((s) => s.isReadOnly);

  const [passCheckRefs, setPassCheckRefs] = useState<StudioConfig["passCheckRefs"]>([]);

  useEffect(() => {
    fetchConfig().then((cfg) => setPassCheckRefs(cfg.passCheckRefs)).catch(console.error);
  }, []);

  const node = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
  // Hook must be called unconditionally — empty string when no node is selected
  const [copied, handleCopy] = useCopyToClipboard(node?.data.skillContent ?? "");

  if (!node) return <EmptyState />;

  const { data } = node;
  const ro = isReadOnly || data.readonly;
  const isScript = data.nodeType === "script";

  const selectedPassCheck = passCheckRefs.find((p) => p.key === data.passCheckRef);

  return (
    <aside style={CONTAINER}>
      {/* Header */}
      <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          Inspector
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>{data.label}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#6e7681", fontFamily: "monospace" }}>{node.id}</span>
          <span style={{ fontSize: 10, color: "#8957e5", background: "rgba(137,87,229,0.12)", border: "1px solid rgba(137,87,229,0.3)", borderRadius: 8, padding: "1px 5px" }}>
            {nodeTypeLabel(data.nodeType, data.scriptKind)}
          </span>
        </div>
      </div>

      {/* Read-only banner */}
      {ro && (
        <div style={{ padding: "8px 16px", background: "#161b22", borderBottom: "1px solid #21262d", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#e3b341" }}>⚠</span>
          <span style={{ fontSize: 11, color: "#8b949e" }}>Static workflow — use Save as Copy to edit.</span>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: "14px 16px", flex: 1 }}>
        <button
          className={`inspector-start-btn${data.isInitial ? " is-initial" : ""}`}
          onClick={() => !data.isInitial && !ro && setInitialNode(node.id)}
          disabled={data.isInitial || ro}
        >
          <span>{data.isInitial ? "▶" : "○"}</span>
          <span>{data.isInitial ? "Start node" : "Set as start node"}</span>
        </button>

        <hr style={HR} />

        {/* Pass-Check — prominent section with dropdown */}
        <div style={SECTION_LABEL}>Pass-Check</div>
        <div style={{ marginBottom: 14 }}>
          <select
            className="studio-select"
            value={data.passCheckRef ?? ""}
            disabled={ro}
            onChange={(e) => updateNodeData(node.id, { passCheckRef: e.target.value || undefined })}
          >
            <option value="">— none —</option>
            {passCheckRefs.map((p) => (
              <option key={p.key} value={p.key}>{p.key}</option>
            ))}
          </select>
          {selectedPassCheck && (
            <div
              style={{
                marginTop: 8,
                background: "#0d1117",
                border: "1px solid #21262d",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 11,
                color: "#8b949e",
                lineHeight: 1.5,
              }}
            >
              {selectedPassCheck.description}
            </div>
          )}
          {!data.passCheckRef && (
            <div style={{ fontSize: 10, color: "#6e7681", marginTop: 6 }}>
              No pass-check — node always runs execute()
            </div>
          )}
        </div>

        <hr style={HR} />

        {/* Config */}
        <div style={SECTION_LABEL}>Config</div>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={FIELD_LABEL}>Name</span>
          <input
            className="studio-input"
            type="text"
            value={data.label}
            disabled={ro}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          />
        </label>

        {isScript && data.scriptKind && (
          <>
            <ScriptConfigFields
              scriptKind={data.scriptKind}
              scriptConfig={data.scriptConfig}
              ro={!!ro}
              onChange={(cfg) => updateNodeData(node.id, { scriptConfig: cfg })}
            />
          </>
        )}

        {!isScript && (
          <>
            <label style={{ display: "block", marginBottom: 10 }}>
              <span style={FIELD_LABEL}>Model</span>
              <input
                className="studio-input"
                type="text"
                value={data.model}
                disabled={ro}
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
                  disabled={ro}
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
                  disabled={ro}
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
                disabled={ro}
                onChange={(e) => updateNodeData(node.id, { permissionProfile: e.target.value })}
              >
                <option value="view-only">view-only</option>
                <option value="safe-write">safe-write</option>
                <option value="read-only">read-only</option>
                <option value="engineer">engineer</option>
              </select>
            </label>

            <hr style={HR} />

            {/* Tools */}
            <div style={SECTION_LABEL}>Tools</div>

            <ToolSelector
              label="Allowed Tools"
              selectedTools={data.allowedTools}
              onChange={(tools) => !ro && updateNodeData(node.id, { allowedTools: tools })}
            />

            <ToolSelector
              label="Disallowed Tools"
              selectedTools={data.disallowedTools}
              onChange={(tools) => !ro && updateNodeData(node.id, { disallowedTools: tools })}
            />

            <hr style={HR} />

            {/* Skill Prompt */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
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
          </>
        )}
      </div>
    </aside>
  );
}
