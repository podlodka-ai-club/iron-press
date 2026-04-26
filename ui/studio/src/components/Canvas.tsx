import { useCallback, useRef } from "react";
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode } from "./AgentNode.js";
import { StatusEdge } from "./StatusEdge.js";
import { useWorkflowStore } from "../store/workflowStore.js";
import type { AgentTypeInfo, BuilderNodeData } from "../types.js";

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { statusEdge: StatusEdge };

interface Props {
  agentTypes: AgentTypeInfo[];
}

export function Canvas({ agentTypes }: Props) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNodeFromPalette = useWorkflowStore((s) => s.addNodeFromPalette);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const flowRef = useRef<HTMLDivElement>(null);

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

      // Convert drop position to flow coordinates
      const rect = flowRef.current?.getBoundingClientRect();
      if (!rect) return;
      const position = { x: e.clientX - rect.left - 110, y: e.clientY - rect.top - 60 };
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
            const colors: Record<string, string> = {
              "business-analyst": "#e3b341",
              engineer: "#f0883e",
              "tech-lead": "#388bfd",
              "product-owner": "#a371f7",
            };
            return role ? (colors[role] ?? "#4a5568") : "#4a5568";
          }}
          style={{ background: "#161b22", border: "1px solid #30363d" }}
        />
      </ReactFlow>
    </div>
  );
}
