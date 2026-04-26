import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import type { AgentTypeInfo, BuilderNodeData, NodeStatus, WorkflowBundle } from "../types.js";
import { layoutNodes } from "../layout.js";
import { createWorkflow, updateWorkflow } from "../api.js";

interface HistoryState {
  nodes: Node<BuilderNodeData>[];
  edges: Edge<{ onStatus: NodeStatus; sourceRole?: string }>[];
  initialNodeId: string;
}

interface WorkflowStore {
  // React Flow graph state
  nodes: Node<BuilderNodeData>[];
  edges: Edge<{ onStatus: NodeStatus; sourceRole?: string }>[];
  onNodesChange: (changes: NodeChange<Node<BuilderNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge<{ onStatus: NodeStatus; sourceRole?: string }>>[]) => void;
  onConnect: (connection: Connection) => void;

  // History state
  past: HistoryState[];
  future: HistoryState[];
  commitHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Workflow meta
  workflowName: string;
  initialNodeId: string;
  isDirty: boolean;

  // UI state
  selectedNodeId: string | null;
  mode: "design" | "run";

  // Phase 2 run state (unused in phase 1)
  executionState: Record<string, "idle" | "running" | "passed" | "failed" | "waiting">;
  setExecutionState: (nodeId: string, status: "idle" | "running" | "passed" | "failed" | "waiting") => void;

  // Actions
  setWorkflowName: (name: string) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setInitialNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, patch: Partial<BuilderNodeData>) => void;
  addNodeFromPalette: (agentType: AgentTypeInfo, position: XYPosition) => void;
  addNodesFromTemplate: (bundle: WorkflowBundle, dropPosition: XYPosition) => void;
  autoLayout: () => void;
  clearCanvas: () => void;
  loadBundle: (bundle: WorkflowBundle) => void;
  saveWorkflow: (isNew: boolean) => Promise<void>;
  deleteSelected: () => void;
}

function uniqueId(base: string, existingIds: Set<string>): string {
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function makeNode(
  id: string,
  position: XYPosition,
  data: BuilderNodeData,
): Node<BuilderNodeData> {
  return { id, type: "agentNode", position, data };
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  past: [],
  future: [],
  workflowName: "",
  initialNodeId: "",
  isDirty: false,
  selectedNodeId: null,
  mode: "design",
  executionState: {},

  commitHistory: () => {
    const { nodes, edges, initialNodeId, past } = get();
    // Don't commit if nothing changed
    const last = past[past.length - 1];
    if (last && last.nodes === nodes && last.edges === edges && last.initialNodeId === initialNodeId) {
      return;
    }
    set({
      past: [...past, { nodes, edges, initialNodeId }],
      future: [],
    });
  },

  undo: () => {
    const { past, future, nodes, edges, initialNodeId } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    if (!previous) return;
    const newPast = past.slice(0, past.length - 1);
    set({
      past: newPast,
      future: [{ nodes, edges, initialNodeId }, ...future],
      nodes: previous.nodes,
      edges: previous.edges,
      initialNodeId: previous.initialNodeId,
      isDirty: true,
    });
  },

  redo: () => {
    const { past, future, nodes, edges, initialNodeId } = get();
    if (future.length === 0) return;
    const next = future[0];
    if (!next) return;
    const newFuture = future.slice(1);
    set({
      past: [...past, { nodes, edges, initialNodeId }],
      future: newFuture,
      nodes: next.nodes,
      edges: next.edges,
      initialNodeId: next.initialNodeId,
      isDirty: true,
    });
  },

  onNodesChange: (changes) => {
    if (changes.some(c => c.type === "remove" || c.type === "add")) {
      get().commitHistory();
    }
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes) as Node<BuilderNodeData>[],
      isDirty: true,
    }));
  },

  onEdgesChange: (changes) => {
    if (changes.some(c => c.type === "remove" || c.type === "add")) {
      get().commitHistory();
    }
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges) as Edge<{ onStatus: NodeStatus; sourceRole?: string }>[],
      isDirty: true,
    }));
  },

  onConnect: (connection) => {
    get().commitHistory();
    if (!connection.sourceHandle) return;
    const status = connection.sourceHandle as NodeStatus;
    set((s) => {
      const sourceNode = s.nodes.find((n) => n.id === connection.source);
      return {
        edges: addEdge(
          {
            ...connection,
            id: `${connection.source}-${connection.target}-${status}`,
            type: "statusEdge",
            data: { onStatus: status, sourceRole: sourceNode?.data?.role },
            label: status,
          },
          s.edges,
        ) as Edge<{ onStatus: NodeStatus; sourceRole?: string }>[],
        isDirty: true,
      };
    });
  },

  setWorkflowName: (name) => set({ workflowName: name, isDirty: true }),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  setInitialNode: (nodeId) => {
    get().commitHistory();
    set((s) => ({
      initialNodeId: nodeId,
      nodes: s.nodes.map((n) => ({
        ...n,
        data: { ...n.data, isInitial: n.id === nodeId },
      })),
      isDirty: true,
    }));
  },

  updateNodeData: (nodeId, patch) => {
    get().commitHistory();
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
      isDirty: true,
    }));
  },

  addNodeFromPalette: (agentType, position) => {
    get().commitHistory();
    const existingIds = new Set(get().nodes.map((n) => n.id));
    const id = uniqueId(agentType.defaultNodeId, existingIds);
    const { initialNodeId } = get();
    const isFirst = get().nodes.length === 0;
    const data: BuilderNodeData = {
      label: agentType.label,
      role: agentType.role,
      skillContent: agentType.defaultSkill,
      isInitial: isFirst,
      ...agentType.defaultConfig,
    };
    const newNode = makeNode(id, position, data);
    set((s) => ({
      nodes: [...s.nodes, newNode],
      initialNodeId: isFirst ? id : initialNodeId,
      isDirty: true,
    }));
  },

  addNodesFromTemplate: (bundle, dropPosition) => {
    get().commitHistory();
    const existingIds = new Set(get().nodes.map((n) => n.id));
    const idMap = new Map<string, string>();

    for (const nd of bundle.definition.nodes) {
      idMap.set(nd.id, uniqueId(nd.id, existingIds));
      existingIds.add(idMap.get(nd.id)!);
    }

    const newNodes: Node<BuilderNodeData>[] = bundle.definition.nodes.map((nd, i) => ({
      id: idMap.get(nd.id)!,
      type: "agentNode",
      position: { x: dropPosition.x + i * 240, y: dropPosition.y },
      data: {
        label: nd.name,
        role: nd.role,
        model: nd.model,
        maxTurns: nd.maxTurns,
        budgetUsd: nd.budgetUsd,
        allowedTools: nd.allowedTools,
        disallowedTools: nd.disallowedTools,
        permissionProfile: nd.permissionProfile,
        skillContent: bundle.skills[nd.id] ?? "",
        isInitial: nd.id === bundle.definition.initialNodeId && get().nodes.length === 0,
      },
    }));

    const newEdges: Edge<{ onStatus: NodeStatus; sourceRole?: string }>[] = bundle.definition.edges.map((e) => {
      const src = idMap.get(e.from) ?? e.from;
      const tgt = idMap.get(e.to) ?? e.to;
      const srcNode = bundle.definition.nodes.find((n) => n.id === e.from);
      return {
        id: `${src}-${tgt}-${e.onStatus}`,
        source: src,
        target: tgt,
        sourceHandle: e.onStatus,
        type: "statusEdge",
        data: { onStatus: e.onStatus, sourceRole: srcNode?.role },
      };
    });

    const allNodes = [...get().nodes, ...newNodes];
    const allEdges = [...get().edges, ...newEdges];
    const laidOut = layoutNodes(allNodes, allEdges);

    const isFirst = get().nodes.length === 0;
    const newInitial = isFirst && bundle.definition.initialNodeId
      ? idMap.get(bundle.definition.initialNodeId) ?? ""
      : get().initialNodeId;

    set({
      nodes: laidOut.map((n) => ({ ...n, data: { ...n.data, isInitial: n.id === newInitial } })) as Node<BuilderNodeData>[],
      edges: allEdges,
      initialNodeId: newInitial,
      isDirty: true,
    });
  },

  deleteSelected: () => {
    const { nodes, edges, selectedNodeId } = get();
    if (!selectedNodeId) return;
    
    get().commitHistory();
    const nodeToDelete = nodes.find(n => n.selected || n.id === selectedNodeId);
    if (nodeToDelete) {
      set({
        nodes: nodes.filter(n => n.id !== nodeToDelete.id),
        edges: edges.filter(e => e.source !== nodeToDelete.id && e.target !== nodeToDelete.id),
        selectedNodeId: null,
        isDirty: true,
      });
    } else {
      const edgeToDelete = edges.find(e => e.selected);
      if (edgeToDelete) {
        set({
          edges: edges.filter(e => e.id !== edgeToDelete.id),
          isDirty: true,
        });
      }
    }
  },

  autoLayout: () => {
    get().commitHistory();
    const { nodes, edges } = get();
    const laid = layoutNodes(nodes, edges);
    set({ nodes: laid as Node<BuilderNodeData>[], isDirty: true });
  },

  clearCanvas: () => {
    get().commitHistory();
    set({ nodes: [], edges: [], workflowName: "", initialNodeId: "", selectedNodeId: null, isDirty: false });
  },

  loadBundle: (bundle) => {
    const nodes: Node<BuilderNodeData>[] = bundle.definition.nodes.map((nd) => ({
      id: nd.id,
      type: "agentNode",
      position: { x: 0, y: 0 },
      data: {
        label: nd.name,
        role: nd.role,
        model: nd.model,
        maxTurns: nd.maxTurns,
        budgetUsd: nd.budgetUsd,
        allowedTools: nd.allowedTools,
        disallowedTools: nd.disallowedTools,
        permissionProfile: nd.permissionProfile,
        skillContent: bundle.skills[nd.id] ?? "",
        isInitial: nd.id === bundle.definition.initialNodeId,
      },
    }));

    const edges: Edge<{ onStatus: NodeStatus; sourceRole?: string }>[] = bundle.definition.edges.map((e) => {
      const srcNode = bundle.definition.nodes.find((n) => n.id === e.from);
      return {
        id: `${e.from}-${e.to}-${e.onStatus}`,
        source: e.from,
        target: e.to,
        sourceHandle: e.onStatus,
        type: "statusEdge",
        data: { onStatus: e.onStatus, sourceRole: srcNode?.role },
      };
    });

    const laid = layoutNodes(nodes, edges);
    set({
      nodes: laid as Node<BuilderNodeData>[],
      edges,
      workflowName: bundle.name,
      initialNodeId: bundle.definition.initialNodeId,
      selectedNodeId: null,
      isDirty: false,
      past: [],
      future: [],
    });
  },

  saveWorkflow: async (isNew) => {
    const { nodes, edges, workflowName, initialNodeId } = get();
    const definition = {
      name: workflowName,
      initialNodeId,
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.data.label,
        role: n.data.role,
        model: n.data.model,
        maxTurns: n.data.maxTurns,
        budgetUsd: n.data.budgetUsd,
        allowedTools: n.data.allowedTools,
        disallowedTools: n.data.disallowedTools,
        permissionProfile: n.data.permissionProfile,
      })),
      edges: edges.map((e) => ({
        from: e.source,
        to: e.target,
        onStatus: (e.data?.onStatus ?? "Pass") as NodeStatus,
      })),
    };
    const skills: Record<string, string> = {};
    for (const n of nodes) skills[n.id] = n.data.skillContent;

    const bundle: WorkflowBundle = { name: workflowName, definition, skills };
    if (isNew) {
      await createWorkflow(bundle);
    } else {
      await updateWorkflow(bundle);
    }
    set({ isDirty: false });
  },

  setExecutionState: (nodeId, status) => {
    set((s) => ({ executionState: { ...s.executionState, [nodeId]: status } }));
  },
}));
