import { useEffect, useState } from "react";
import type { AgentTypeInfo, WorkflowBundle } from "./types.js";
import { fetchAgentTypes, fetchWorkflow, fetchWorkflows } from "./api.js";
import { Canvas } from "./components/Canvas.js";
import { NodeLibrary } from "./components/NodeLibrary.js";
import { Inspector } from "./components/Inspector.js";
import { Toolbar } from "./components/Toolbar.js";
import { ValidationBanner } from "./components/ValidationBanner.js";
import { useWorkflowStore } from "./store/workflowStore.js";
import { useRoute } from "./routing.js";
import type { ValidationResult } from "./validate.js";

export function App() {
  const { route } = useRoute();
  const loadBundle = useWorkflowStore((s) => s.loadBundle);

  const [agentTypes, setAgentTypes] = useState<AgentTypeInfo[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowBundle[]>([]);
  const [validation, setValidation] = useState<ValidationResult>({ valid: true, errors: [] });
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);

  useEffect(() => {
    fetchAgentTypes().then(setAgentTypes).catch(console.error);
    fetchWorkflows().then(setWorkflows).catch(console.error);
  }, []);

  // Load workflow from URL on mount
  useEffect(() => {
    if (!route.workflowName) return;
    fetchWorkflow(route.workflowName).then(loadBundle).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string, error = false) {
    setToast({ msg, error });
    // Also refresh the workflow list so Load dropdown is current after save
    fetchWorkflows().then(setWorkflows).catch(console.error);
    setTimeout(() => setToast(null), 3000);
  }

  const blockingErrors = validation.errors.filter((e) => e.blocking);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0d1117" }}>
      {/* Top bar */}
      <div style={{ height: 40, borderBottom: "1px solid #21262d", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0, background: "#161b22" }}>
        <a href="/" style={{ fontSize: 12, color: "#6e7681", textDecoration: "none" }}>← Monitor</a>
        <span style={{ color: "#30363d" }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>iron-press Studio</span>
      </div>

      {/* Validation banner */}
      {blockingErrors.length > 0 && <ValidationBanner errors={validation.errors} />}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: toast.error ? "#742a2a" : "#1c4532",
            border: `1px solid ${toast.error ? "#fc8181" : "#68d391"}`,
            color: toast.error ? "#fc8181" : "#68d391",
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: 13,
            zIndex: 1000,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Three-panel body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <NodeLibrary agentTypes={agentTypes} workflows={workflows} />

        {/* Canvas area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <Canvas agentTypes={agentTypes} />
          <Toolbar
            workflows={workflows}
            onValidation={setValidation}
            onMessage={showToast}
          />
        </div>

        <Inspector />
      </div>
    </div>
  );
}
