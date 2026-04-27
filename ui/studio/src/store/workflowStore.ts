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
import type { AgentTypeInfo, BuilderNodeData, NodeStatus, WorkflowBundle, WorkflowDefinition } from "../types.js";
import { layoutNodes } from "../layout.js";
import { createWorkflow, updateWorkflow } from "../api.js";
import { TEMPLATE_DROP_X_STEP } from "../constants.js";

// ─── TYPES ──────────────────────────────────────────────────────────────────

type FlowEdge = Edge<{ onStatus: NodeStatus; sourceRole?: string }>;

interface HistoryState {
  nodes: Node<BuilderNodeData>[];
  edges: FlowEdge[];
  initialNodeId: string;
}

interface WorkflowStore {
  // Graph state
  nodes: Node<BuilderNodeData>[];
  edges: FlowEdge[];
  onNodesChange: (changes: NodeChange<Node<BuilderNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  // History
  past: HistoryState[];
  future: HistoryState[];
  commitHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Workflow metadata
  workflowName: string;
  initialNodeId: string;
  isDirty: boolean;

  // Selection
  selectedNodeId: string | null;

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

// ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

function uniqueId(base: string, existingIds: Set<string>): string {
  if (!existingIds.has(base)) return base;
  let i = 2;
  while (existingIds.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

interface BundleConversionOpts {
  resolveId?: (id: string) => string;
  nodePosition?: (index: number) => XYPosition;
  isInitial?: (nodeId: string) => boolean;
}

function bundleToFlow(
  bundle: WorkflowBundle,
  opts: BundleConversionOpts = {},
): { nodes: Node<BuilderNodeData>[]; edges: FlowEdge[] } {
  const resolveId = opts.resolveId ?? ((id) => id);
  const nodePosition = opts.nodePosition ?? (() => ({ x: 0, y: 0 }));
  const isInitial = opts.isInitial ?? ((id) => id === bundle.definition.initialNodeId);

  const nodes: Node<BuilderNodeData>[] = bundle.definition.nodes.map((nd, i) => ({
    id: resolveId(nd.id),
    type: "agentNode",
    position: nodePosition(i),
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
      isInitial: isInitial(nd.id),
    },
  }));

  const edges: FlowEdge[] = bundle.definition.edges.map((e) => {
    const src = resolveId(e.from);
    const tgt = resolveId(e.to);
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

  return { nodes, edges };
}

function nodesToDefinition(
  nodes: Node<BuilderNodeData>[],
  edges: FlowEdge[],
  workflowName: string,
  initialNodeId: string,
): WorkflowDefinition {
  return {
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
}

// ─── STORE ──────────────────────────────────────────────────────────────────

export const useWorkflowStore = create<WorkflowStore>((set, get) => {
  // Wraps any undo-able mutation: commits history, applies the update, marks dirty.
  const mutate = (updater: (s: WorkflowStore) => Partial<WorkflowStore>) => {
    get().commitHistory();
    set((s) => ({ ...updater(s), isDirty: true }));
  };

  return {
    // ── initial state ────────────────────────────────────────────────────────
    nodes: [],
    edges: [],
    past: [],
    future: [],
    workflowName: "",
    initialNodeId: "",
    isDirty: false,
    selectedNodeId: null,

    // ── graph events (React Flow callbacks) ──────────────────────────────────
    onNodesChange: (changes) => {
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        get().commitHistory();
      }
      set((s) => ({
        nodes: applyNodeChanges(changes, s.nodes) as Node<BuilderNodeData>[],
        isDirty: true,
      }));
    },

    onEdgesChange: (changes) => {
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        get().commitHistory();
      }
      set((s) => ({
        edges: applyEdgeChanges(changes, s.edges) as FlowEdge[],
        isDirty: true,
      }));
    },

    onConnect: (connection) => {
      if (!connection.sourceHandle) return;
      const status = connection.sourceHandle as NodeStatus;
      mutate((s) => {
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
          ) as FlowEdge[],
        };
      });
    },

    // ── history ──────────────────────────────────────────────────────────────
    commitHistory: () => {
      const { nodes, edges, initialNodeId, past } = get();
      const last = past[past.length - 1];
      if (last && last.nodes === nodes && last.edges === edges && last.initialNodeId === initialNodeId) return;
      set({ past: [...past, { nodes, edges, initialNodeId }], future: [] });
    },

    undo: () => {
      const { past, future, nodes, edges, initialNodeId } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      if (!previous) return;
      set({
        past: past.slice(0, past.length - 1),
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
      set({
        past: [...past, { nodes, edges, initialNodeId }],
        future: future.slice(1),
        nodes: next.nodes,
        edges: next.edges,
        initialNodeId: next.initialNodeId,
        isDirty: true,
      });
    },

    // ── selection & metadata ─────────────────────────────────────────────────
    setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

    setWorkflowName: (name) => set({ workflowName: name, isDirty: true }),

    // ── node operations ──────────────────────────────────────────────────────
    setInitialNode: (nodeId) =>
      mutate((s) => ({
        initialNodeId: nodeId,
        nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data, isInitial: n.id === nodeId } })),
      })),

    updateNodeData: (nodeId, patch) =>
      mutate((s) => ({
        nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      })),

    addNodeFromPalette: (agentType, position) => {
      const existingIds = new Set(get().nodes.map((n) => n.id));
      const id = uniqueId(agentType.defaultNodeId, existingIds);
      const isFirst = get().nodes.length === 0;
      const { model, maxTurns, budgetUsd, allowedTools, disallowedTools, permissionProfile } = agentType.defaultConfig;
      const data: BuilderNodeData = {
        label: agentType.label,
        role: agentType.role,
        skillContent: agentType.defaultSkill,
        isInitial: isFirst,
        model,
        maxTurns,
        budgetUsd,
        allowedTools,
        disallowedTools,
        permissionProfile,
      };
      mutate((s) => ({
        nodes: [...s.nodes, { id, type: "agentNode", position, data }],
        initialNodeId: isFirst ? id : s.initialNodeId,
      }));
    },

    addNodesFromTemplate: (bundle, dropPosition) => {
      const existingIds = new Set(get().nodes.map((n) => n.id));
      const idMap = new Map<string, string>();
      for (const nd of bundle.definition.nodes) {
        idMap.set(nd.id, uniqueId(nd.id, existingIds));
        existingIds.add(idMap.get(nd.id)!);
      }

      const currentNodeCount = get().nodes.length;
      const { nodes: newNodes, edges: newEdges } = bundleToFlow(bundle, {
        resolveId: (id) => idMap.get(id) ?? id,
        nodePosition: (i) => ({ x: dropPosition.x + i * TEMPLATE_DROP_X_STEP, y: dropPosition.y }),
        isInitial: (id) => id === bundle.definition.initialNodeId && currentNodeCount === 0,
      });

      mutate((s) => {
        const allNodes = [...s.nodes, ...newNodes];
        const allEdges = [...s.edges, ...newEdges];
        const laidOut = layoutNodes(allNodes, allEdges);

        const isFirst = s.nodes.length === 0;
        const newInitial = isFirst && bundle.definition.initialNodeId
          ? (idMap.get(bundle.definition.initialNodeId) ?? "")
          : s.initialNodeId;

        return {
          nodes: laidOut.map((n) => ({
            ...n,
            data: { ...(n as Node<BuilderNodeData>).data, isInitial: n.id === newInitial },
          })) as Node<BuilderNodeData>[],
          edges: allEdges,
          initialNodeId: newInitial,
        };
      });
    },

    deleteSelected: () => {
      const { nodes, edges, selectedNodeId } = get();
      if (!selectedNodeId) return;

      const nodeToDelete = nodes.find((n) => n.selected || n.id === selectedNodeId);
      if (nodeToDelete) {
        mutate(() => ({
          nodes: nodes.filter((n) => n.id !== nodeToDelete.id),
          edges: edges.filter((e) => e.source !== nodeToDelete.id && e.target !== nodeToDelete.id),
          selectedNodeId: null,
        }));
        return;
      }

      const edgeToDelete = edges.find((e) => e.selected);
      if (edgeToDelete) {
        mutate(() => ({ edges: edges.filter((e) => e.id !== edgeToDelete.id) }));
      }
    },

    autoLayout: () =>
      mutate((s) => ({
        nodes: layoutNodes(s.nodes, s.edges) as Node<BuilderNodeData>[],
      })),

    // ── workflow lifecycle ───────────────────────────────────────────────────
    clearCanvas: () => {
      get().commitHistory();
      set({ nodes: [], edges: [], workflowName: "", initialNodeId: "", selectedNodeId: null, isDirty: false });
    },

    loadBundle: (bundle) => {
      const { nodes, edges } = bundleToFlow(bundle);
      const laidOut = layoutNodes(nodes, edges);
      set({
        nodes: laidOut as Node<BuilderNodeData>[],
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
      const definition = nodesToDefinition(nodes, edges, workflowName, initialNodeId);
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
  };
});
