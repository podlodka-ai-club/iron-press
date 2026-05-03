import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode } from "./AgentNode.js";
import { ScriptNode } from "./ScriptNode.js";
import { StatusEdge } from "./StatusEdge.js";
import { useWorkflowStore } from "../store/workflowStore.js";
import { useWorkflowShortcuts } from "../hooks/useWorkflowShortcuts.js";
import { ROLE_COLORS, ROLE_COLOR_FALLBACK, DROP_OFFSET_X, DROP_OFFSET_Y } from "../constants.js";
import type { AgentTypeInfo, BuilderNodeData } from "../types.js";
import { fetchAgents } from "../api.js";

const nodeTypes = { agentNode: AgentNode, scriptNode: ScriptNode };
const edgeTypes = { statusEdge: StatusEdge };

export function Canvas() {
  const [agentTypes, setAgentTypes] = useState<AgentTypeInfo[]>([]);

  useEffect(() => {
    fetchAgents()
      .then((agents) =>
        setAgentTypes(
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
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNodeFromPalette = useWorkflowStore((s) => s.addNodeFromPalette);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const commitHistory = useWorkflowStore((s) => s.commitHistory);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const flowRef = useRef<HTMLDivElement>(null);

  useWorkflowShortcuts({ undo, redo });

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const role = e.dataTransfer.getData("application/agent-role");
      if (!role) return;

      const agentType = agentTypes.find((a) => a.role === role);
      if (!agentType) return;

      const rect = flowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const position = { x: e.clientX - rect.left - DROP_OFFSET_X, y: e.clientY - rect.top - DROP_OFFSET_Y };
      addNodeFromPalette(agentType, position);
    },
    [agentTypes, addNodeFromPalette],
  );

  return (
    <div ref={flowRef} style={{ width: "100%", height: "100%" }} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={commitHistory}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onPaneClick={() => setSelectedNode(null)}
        fitView
        colorMode="dark"
      >
        <Background color="#2d3748" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const role = (n.data as BuilderNodeData | undefined)?.role;
            return role ? (ROLE_COLORS[role] ?? ROLE_COLOR_FALLBACK) : ROLE_COLOR_FALLBACK;
          }}
          style={{ background: "#161b22", border: "1px solid #30363d" }}
        />
      </ReactFlow>
    </div>
  );
}
