import { useState } from "react";
import { Panel } from "@xyflow/react";
import type { WorkflowBundle } from "../types.js";
import { useWorkflowStore } from "../store/workflowStore.js";
import { validateWorkflow, type ValidationResult } from "../validate.js";
import { fetchWorkflow } from "../api.js";

interface Props {
  workflows: WorkflowBundle[];
  onValidation: (result: ValidationResult) => void;
  onMessage: (msg: string, isError?: boolean) => void;
}

export function Toolbar({ workflows, onValidation, onMessage }: Props) {
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const initialNodeId = useWorkflowStore((s) => s.initialNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const autoLayout = useWorkflowStore((s) => s.autoLayout);
  const clearCanvas = useWorkflowStore((s) => s.clearCanvas);
  const loadBundle = useWorkflowStore((s) => s.loadBundle);
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);

  const [saving, setSaving] = useState(false);
  const [showLoad, setShowLoad] = useState(false);

  const isExisting = workflows.some((w) => w.name === workflowName);

  async function handleSave() {
    const result = validateWorkflow(workflowName, initialNodeId, nodes, edges);
    onValidation(result);
    if (!result.valid) return;

    setSaving(true);
    try {
      await saveWorkflow(!isExisting);
      onMessage(`Saved "${workflowName}"`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Save failed", true);
    } finally {
      setSaving(false);
    }
  }

  async function handleLoad(name: string) {
    setShowLoad(false);
    try {
      const bundle = await fetchWorkflow(name);
      loadBundle(bundle);
      window.history.pushState(null, "", `/studio/${encodeURIComponent(name)}/design`);
    } catch {
      onMessage(`Failed to load "${name}"`, true);
    }
  }

  const saveDisabled = saving || !isDirty;

  return (
    <Panel position="top-left">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: "6px 10px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        <button className="toolbar-btn" onClick={clearCanvas}>New</button>

        <div style={{ position: "relative" }}>
          <button
            className="toolbar-btn"
            onClick={() => setShowLoad((v) => !v)}
          >
            Load ▾
          </button>
          {showLoad && (
            <div className="toolbar-dropdown">
              {workflows.length === 0 ? (
                <div style={{ padding: "8px 12px", fontSize: 12, color: "#6e7681" }}>
                  No saved workflows
                </div>
              ) : (
                workflows.map((wf) => (
                  <div
                    key={wf.name}
                    className="dropdown-item"
                    onClick={() => void handleLoad(wf.name)}
                  >
                    {wf.name}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 16, background: "#30363d" }} />

        <input
          className="toolbar-input"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          placeholder="workflow-name"
        />

        <button
          className={`toolbar-btn${saveDisabled ? "" : " toolbar-btn-primary"}`}
          onClick={() => void handleSave()}
          disabled={saveDisabled}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <div style={{ width: 1, height: 16, background: "#30363d" }} />

        <button className="toolbar-btn" onClick={autoLayout}>
          Auto layout
        </button>
      </div>
    </Panel>
  );
}
