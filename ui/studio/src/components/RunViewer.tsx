import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchRun, fetchWorkflow, openRunEventsSse } from "../api.js";
import { layoutNodes } from "../layout.js";
import type {
  EventRecord,
  HistoryEntry,
  NodeExecutionInfo,
  NodeExecutionState,
  RunDetail,
  RunStatus,
} from "../run-types.js";
import type { WorkflowBundle } from "../types.js";
import { ROLE_COLORS, ROLE_COLOR_FALLBACK, STATUS_COLORS } from "../constants.js";

// ─── NODE EXECUTION STATE COLORS ────────────────────────────────────────────

const EXEC_STATE_COLORS: Record<NodeExecutionState, { border: string; bg: string; glow?: string }> = {
  idle: { border: "#30363d", bg: "#21262d" },
  running: { border: "#f0883e", bg: "#21262d", glow: "0 0 12px rgba(240,136,62,0.5)" },
  passed: { border: "#3fb950", bg: "#161b22" },
  failed: { border: "#f85149", bg: "#200c0c" },
  waiting: { border: "#8b949e", bg: "#21262d" },
};

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface RunNodeData extends Record<string, unknown> {
  label: string;
  role: string;
  execInfo: NodeExecutionInfo;
  isInitial: boolean;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function statusToExecState(status: string): NodeExecutionState {
  if (status === "Pass") return "passed";
  if (status === "Fail") return "failed";
  if (status === "WaitUserInput") return "waiting";
  return "idle";
}

/**
 * Derive per-node execution info from the history array (post-run)
 * and any live node_entered / node_exited events.
 */
function deriveNodeExecutionMap(
  events: EventRecord[],
): Map<string, NodeExecutionInfo> {
  const map = new Map<string, NodeExecutionInfo>();

  // First pass: process history from run_finished if present
  const finishedEvent = [...events].reverse().find((e) => e.type === "run_finished");
  if (finishedEvent) {
    const data = finishedEvent.data as { history?: HistoryEntry[] } | null;
    for (const entry of data?.history ?? []) {
      const existing = map.get(entry.nodeId);
      const durationMs = entry.exitedAt && entry.enteredAt
        ? Date.parse(entry.exitedAt) - Date.parse(entry.enteredAt)
        : undefined;
      map.set(entry.nodeId, {
        state: statusToExecState(entry.status),
        enteredAt: entry.enteredAt,
        exitedAt: entry.exitedAt,
        durationMs,
        visitCount: (existing?.visitCount ?? 0) + 1,
      });
    }
    return map;
  }

  // Second pass: live events (run still in progress)
  for (const event of events) {
    const data = event.data as { nodeId?: string; status?: string } | null;
    if (!data?.nodeId) continue;
    const nodeId = data.nodeId;

    if (event.type === "node_entered") {
      const existing = map.get(nodeId);
      map.set(nodeId, {
        state: "running",
        enteredAt: event.t,
        visitCount: (existing?.visitCount ?? 0) + 1,
      });
    } else if (event.type === "node_exited") {
      const existing = map.get(nodeId);
      const durationMs = existing?.enteredAt
        ? Date.parse(event.t) - Date.parse(existing.enteredAt)
        : undefined;
      map.set(nodeId, {
        state: statusToExecState(data.status ?? ""),
        enteredAt: existing?.enteredAt,
        exitedAt: event.t,
        durationMs,
        visitCount: existing?.visitCount ?? 1,
      });
    }
  }

  return map;
}

/**
 * Extract the workflow name from run events or meta.
 */
function extractWorkflowName(run: RunDetail): string | null {
  // Try flags in meta
  const flags = run.meta?.flags as Record<string, unknown> | undefined;
  if (typeof flags?.workflow === "string") return flags.workflow;

  // Try run_started / run_resumed event data
  for (const event of run.events) {
    if (event.type === "run_started" || event.type === "run_resumed") {
      const d = event.data as { flags?: Record<string, unknown> } | null;
      if (typeof d?.flags?.workflow === "string") return d.flags.workflow;
    }
  }

  return null;
}

// ─── CUSTOM RUN NODE ─────────────────────────────────────────────────────────

function RunNode({ data }: { data: RunNodeData }) {
  const { execInfo, label, role, isInitial } = data;
  const roleColor = ROLE_COLORS[role] ?? ROLE_COLOR_FALLBACK;
  const stateStyle = EXEC_STATE_COLORS[execInfo.state];
  const isRunning = execInfo.state === "running";

  return (
    <div
      style={{
        width: 220,
        background: stateStyle.bg,
        borderRadius: 8,
        borderTop: `1px solid ${stateStyle.border}`,
        borderRight: `1px solid ${stateStyle.border}`,
        borderBottom: `1px solid ${stateStyle.border}`,
        borderLeft: isInitial ? `3px solid #3fb950` : `1px solid ${stateStyle.border}`,
        boxShadow: stateStyle.glow ?? "0 1px 4px rgba(0,0,0,0.3)",
        transition: "all 0.3s ease",
        cursor: "default",
        userSelect: "none",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      {/* Header */}
      <div
        style={{
          background: "#161b22",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #30363d",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: roleColor,
            flexShrink: 0,
            animation: isRunning ? "pulse 1.5s infinite" : "none",
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#e6edf3",
            flexGrow: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {isInitial && (
          <span style={{ fontSize: 10, color: "#3fb950", fontWeight: 700, flexShrink: 0 }}>▶</span>
        )}
      </div>

      {/* Status badge + timing */}
      <div style={{ padding: "8px 12px 10px" }}>
        <ExecStateBadge state={execInfo.state} />
        {execInfo.durationMs !== undefined && (
          <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>
            {fmtDuration(execInfo.durationMs)}
          </div>
        )}
        {execInfo.enteredAt && (
          <div style={{ fontSize: 10, color: "#6e7681", marginTop: 2 }}>
            started {fmtTime(execInfo.enteredAt)}
          </div>
        )}
        {execInfo.visitCount > 1 && (
          <div style={{ fontSize: 10, color: "#6e7681", marginTop: 2 }}>
            {execInfo.visitCount}× visited
          </div>
        )}
      </div>
    </div>
  );
}

function ExecStateBadge({ state }: { state: NodeExecutionState }) {
  const COLOR_MAP: Record<NodeExecutionState, string> = {
    idle: "#6e7681",
    running: "#f0883e",
    passed: "#3fb950",
    failed: "#f85149",
    waiting: "#8b949e",
  };
  const LABEL_MAP: Record<NodeExecutionState, string> = {
    idle: "Pending",
    running: "Running…",
    passed: "Pass",
    failed: "Fail",
    waiting: "Waiting",
  };
  const color = COLOR_MAP[state];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        background: "#0d1117",
        border: `1px solid ${color}`,
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 600,
        color,
        letterSpacing: "0.02em",
      }}
    >
      {LABEL_MAP[state]}
    </span>
  );
}

const nodeTypes = { runNode: RunNode };

// ─── EXECUTION PATH OVERLAY ──────────────────────────────────────────────────

/**
 * Given an ordered set of history entries, mark edges that were traversed.
 * An edge was traversed when the source node exited with the edge's status
 * and the target was the next node visited.
 */
function markTraversedEdges(
  edges: Edge[],
  events: EventRecord[],
): Set<string> {
  const traversed = new Set<string>();

  // Build ordered list of (nodeId, status) pairs from history or live events
  const visits: Array<{ nodeId: string; status: string }> = [];

  const finishedEvent = [...events].reverse().find((e) => e.type === "run_finished");
  if (finishedEvent) {
    const data = finishedEvent.data as { history?: HistoryEntry[] } | null;
    for (const entry of data?.history ?? []) {
      visits.push({ nodeId: entry.nodeId, status: entry.status });
    }
  } else {
    // Build from live events
    const exitedEvents = events.filter((e) => e.type === "node_exited");
    for (const ev of exitedEvents) {
      const d = ev.data as { nodeId?: string; status?: string } | null;
      if (d?.nodeId && d.status) visits.push({ nodeId: d.nodeId, status: d.status });
    }
  }

  // For each consecutive pair (visits[i] → visits[i+1]), find the matching edge
  for (let i = 0; i < visits.length - 1; i++) {
    const from = visits[i];
    const to = visits[i + 1];
    if (!from || !to) continue;
    const edge = edges.find(
      (e) => e.source === from.nodeId && e.target === to.nodeId && e.data?.onStatus === from.status,
    );
    if (edge) traversed.add(edge.id);
  }

  return traversed;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

interface Props {
  runId: string;
  embed?: boolean;
}

type LoadState = "loading" | "ready" | "error";

export function RunViewer({ runId, embed = false }: Props) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [workflowBundle, setWorkflowBundle] = useState<WorkflowBundle | null>(null);
  const [execMap, setExecMap] = useState<Map<string, NodeExecutionInfo>>(new Map());
  const [runStatus, setRunStatus] = useState<RunStatus>("unknown");
  const [traversedEdgeIds, setTraversedEdgeIds] = useState<Set<string>>(new Set());

  const eventsRef = useRef<EventRecord[]>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<RunNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ── Build/update React Flow nodes ──
  const rebuildNodes = useCallback(
    (bundle: WorkflowBundle, map: Map<string, NodeExecutionInfo>) => {
      const { definition } = bundle;
      const rawNodes: Node<RunNodeData>[] = definition.nodes.map((nd, i) => ({
        id: nd.id,
        type: "runNode",
        position: { x: i * 260, y: 0 },
        data: {
          label: nd.name,
          role: nd.role,
          isInitial: nd.id === definition.initialNodeId,
          execInfo: map.get(nd.id) ?? { state: "idle", visitCount: 0 },
        },
      }));

      const rawEdges: Edge[] = definition.edges.map((e) => ({
        id: `${e.from}-${e.to}-${e.onStatus}`,
        source: e.from,
        target: e.to,
        type: "default",
        animated: false,
        data: { onStatus: e.onStatus },
        style: { stroke: "#8b949e", strokeWidth: 1.5, opacity: 0.4 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8b949e" },
        labelStyle: {
          fill: STATUS_COLORS[e.onStatus] ?? "#8b949e",
          fontSize: 10,
          fontWeight: 700,
        },
        labelBgStyle: { fill: "#161b22" },
      }));

      const laid = layoutNodes(rawNodes, rawEdges);
      setNodes(laid as Node<RunNodeData>[]);
      setEdges(rawEdges);
    },
    [setNodes, setEdges],
  );

  // ── Update edge highlights ──
  const updateEdgeHighlights = useCallback(
    (currentEdges: Edge[], currentEvents: EventRecord[]) => {
      const traversed = markTraversedEdges(currentEdges, currentEvents);
      setTraversedEdgeIds(traversed);
      setEdges((prev) =>
        prev.map((e) => {
          const isTraversed = traversed.has(e.id);
          const statusColor = STATUS_COLORS[((e.data as { onStatus?: string } | undefined)?.onStatus ?? "") as import("../types.js").NodeStatus] ?? "#8b949e";
          const color = isTraversed ? statusColor : "#8b949e";
          return {
            ...e,
            animated: isTraversed,
            label: isTraversed ? e.data?.onStatus as string : undefined,
            style: {
              ...e.style,
              stroke: color,
              strokeWidth: isTraversed ? 2.5 : 1.5,
              opacity: isTraversed ? 1 : 0.4,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color },
          };
        }),
      );
    },
    [setEdges],
  );

  // ── Initial load ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const run = await fetchRun(runId);
        if (cancelled) return;

        setRunDetail(run);
        setRunStatus(run.status);
        eventsRef.current = run.events;

        const workflowName = extractWorkflowName(run);
        if (!workflowName) {
          // Can't show graph without workflow definition, but show run info
          setLoadState("ready");
          return;
        }

        let bundle: WorkflowBundle;
        try {
          bundle = await fetchWorkflow(workflowName);
        } catch {
          // Workflow file may not exist (static workflow); show run info only
          setLoadState("ready");
          return;
        }
        if (cancelled) return;

        setWorkflowBundle(bundle);
        const map = deriveNodeExecutionMap(run.events);
        setExecMap(map);
        rebuildNodes(bundle, map);
        setLoadState("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setLoadState("error");
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [runId, rebuildNodes]);

  // ── Update edge highlights after initial layout ──
  useEffect(() => {
    if (edges.length > 0 && eventsRef.current.length > 0) {
      updateEdgeHighlights(edges, eventsRef.current);
    }
  }, [edges.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live SSE subscription ──
  useEffect(() => {
    if (loadState !== "ready") return;
    if (runStatus === "done" || runStatus === "error") return;

    const close = openRunEventsSse(runId, {
      event: (data) => {
        const ev = data as EventRecord;
        eventsRef.current = [...eventsRef.current, ev];

        if (workflowBundle) {
          const map = deriveNodeExecutionMap(eventsRef.current);
          setExecMap(map);
          rebuildNodes(workflowBundle, map);
          // Edge highlights updated via useEffect watching edges.length
        }
      },
      snapshot: (data) => {
        const s = data as { status?: RunStatus } | null;
        if (s?.status) setRunStatus(s.status);
      },
    });

    return close;
  }, [loadState, runStatus, runId, workflowBundle, rebuildNodes]);

  // ── Update edge highlights when execMap changes ──
  useEffect(() => {
    if (edges.length > 0) {
      updateEdgeHighlights(edges, eventsRef.current);
    }
  }, [execMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#8b949e", fontSize: 14 }}>
        Loading run {runId}…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#f85149", fontSize: 14 }}>
        Error: {errorMsg}
      </div>
    );
  }

  if (!workflowBundle) {
    return (
      <NoGraphFallback runId={runId} runDetail={runDetail} runStatus={runStatus} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {!embed && <RunHeader runId={runId} runDetail={runDetail} runStatus={runStatus} workflowName={workflowBundle.name} />}

      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
        >
          <Background color="#2d3748" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as RunNodeData | undefined;
              if (!d) return ROLE_COLOR_FALLBACK;
              const stateStyle = EXEC_STATE_COLORS[d.execInfo.state];
              return stateStyle.border;
            }}
            style={{ background: "#161b22", border: "1px solid #30363d" }}
          />
        </ReactFlow>

        {/* Legend overlay */}
        <RunLegend />
      </div>

      <ExecutionHistory events={eventsRef.current} />
    </div>
  );
}

// ─── HEADER ──────────────────────────────────────────────────────────────────

function RunHeader({
  runId,
  runDetail,
  runStatus,
  workflowName,
}: {
  runId: string;
  runDetail: RunDetail | null;
  runStatus: RunStatus;
  workflowName: string;
}) {
  const STATUS_COLORS_MAP: Record<RunStatus, string> = {
    running: "#f0883e",
    done: "#3fb950",
    blocked: "#8b949e",
    error: "#f85149",
    unknown: "#6e7681",
  };
  const statusColor = STATUS_COLORS_MAP[runStatus];
  const rootInput = runDetail?.meta?.rootInput as string | undefined;
  const flags = runDetail?.meta?.flags as Record<string, unknown> | undefined;
  const workflowFlag = typeof flags?.workflow === "string" ? flags.workflow : workflowName;

  return (
    <div
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid #21262d",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#161b22",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3", marginBottom: 2 }}>
          {rootInput && <span style={{ color: "#8b949e", marginRight: 8 }}>{rootInput}</span>}
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6e7681" }}>{runId}</span>
        </div>
        <div style={{ fontSize: 11, color: "#6e7681" }}>
          workflow: <span style={{ color: "#8b949e" }}>{workflowFlag}</span>
        </div>
      </div>

      <span
        style={{
          padding: "3px 10px",
          background: `${statusColor}22`,
          border: `1px solid ${statusColor}`,
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          color: statusColor,
          flexShrink: 0,
        }}
      >
        {runStatus}
        {runStatus === "running" && " ⟳"}
      </span>

      <a
        href={`/runs/${encodeURIComponent(runId)}`}
        style={{ fontSize: 11, color: "#6e7681", textDecoration: "none", flexShrink: 0 }}
      >
        ← detail view
      </a>
    </div>
  );
}

// ─── LEGEND ──────────────────────────────────────────────────────────────────

function RunLegend() {
  const items: Array<{ state: NodeExecutionState; label: string }> = [
    { state: "idle", label: "Pending" },
    { state: "running", label: "Running" },
    { state: "passed", label: "Passed" },
    { state: "failed", label: "Failed" },
    { state: "waiting", label: "Waiting" },
  ];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 40,
        right: 16,
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 11,
        color: "#8b949e",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 10,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
      }}
    >
      {items.map(({ state, label }) => (
        <div key={state} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              border: `2px solid ${EXEC_STATE_COLORS[state].border}`,
              background: EXEC_STATE_COLORS[state].bg,
              flexShrink: 0,
            }}
          />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── EXECUTION HISTORY PANEL ─────────────────────────────────────────────────

function ExecutionHistory({ events }: { events: EventRecord[] }) {
  const nodeEvents = useMemo(
    () => events.filter((e) => e.type === "node_entered" || e.type === "node_exited" || e.type === "run_finished"),
    [events],
  );

  // Also extract history entries from run_finished
  const historyEntries = useMemo<HistoryEntry[]>(() => {
    const finished = [...events].reverse().find((e) => e.type === "run_finished");
    if (!finished) return [];
    const data = finished.data as { history?: HistoryEntry[] } | null;
    return data?.history ?? [];
  }, [events]);

  if (nodeEvents.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        borderTop: "1px solid #21262d",
        background: "#0d1117",
        padding: "8px 16px",
        maxHeight: 120,
        overflowY: "auto",
        flexShrink: 0,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: "#6e7681", textTransform: "uppercase", letterSpacing: "0.08em", alignSelf: "center", flexShrink: 0 }}>
        Execution path
      </div>
      {historyEntries.length > 0
        ? historyEntries.map((entry, i) => (
            <HistoryChip key={i} nodeId={entry.nodeId} nodeName={entry.nodeName} status={entry.status} durationMs={entry.exitedAt && entry.enteredAt ? Date.parse(entry.exitedAt) - Date.parse(entry.enteredAt) : undefined} />
          ))
        : nodeEvents.map((ev, i) => {
            const d = ev.data as { nodeId?: string; nodeName?: string; status?: string } | null;
            if (!d?.nodeId) return null;
            return <LiveEventChip key={i} event={ev} />;
          })}
    </div>
  );
}

function HistoryChip({
  nodeId,
  nodeName,
  status,
  durationMs,
}: {
  nodeId: string;
  nodeName: string;
  status: string;
  durationMs?: number;
}) {
  const color = status === "Pass" ? "#3fb950" : status === "Fail" ? "#f85149" : "#8b949e";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "#161b22",
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: 11,
        color: "#c9d1d9",
        flexShrink: 0,
      }}
    >
      <span style={{ color: "#6e7681", fontFamily: "monospace", fontSize: 10 }}>{nodeId}</span>
      <span style={{ color: "#6e7681" }}>·</span>
      <span style={{ color, fontWeight: 600 }}>{status}</span>
      {durationMs !== undefined && (
        <>
          <span style={{ color: "#6e7681" }}>·</span>
          <span style={{ color: "#8b949e" }}>{fmtDuration(durationMs)}</span>
        </>
      )}
    </div>
  );
}

function LiveEventChip({ event }: { event: EventRecord }) {
  const d = event.data as { nodeId?: string; status?: string } | null;
  if (!d?.nodeId) return null;
  const isEntered = event.type === "node_entered";
  const color = isEntered ? "#f0883e" : d.status === "Pass" ? "#3fb950" : d.status === "Fail" ? "#f85149" : "#8b949e";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "#161b22",
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: 11,
        color: "#c9d1d9",
        flexShrink: 0,
      }}
    >
      <span style={{ color: "#6e7681", fontFamily: "monospace", fontSize: 10 }}>{d.nodeId}</span>
      <span style={{ color: "#6e7681" }}>·</span>
      <span style={{ color, fontWeight: 600 }}>{isEntered ? "▶" : d.status ?? "?"}</span>
    </div>
  );
}

// ─── FALLBACK (no workflow definition) ───────────────────────────────────────

function NoGraphFallback({
  runId,
  runDetail,
  runStatus,
}: {
  runId: string;
  runDetail: RunDetail | null;
  runStatus: RunStatus;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center", gap: 12, color: "#6e7681" }}>
      <div style={{ fontSize: 14, color: "#8b949e" }}>No workflow definition found for run</div>
      <div style={{ fontFamily: "monospace", fontSize: 12 }}>{runId}</div>
      <a href={`/runs/${encodeURIComponent(runId)}`} style={{ fontSize: 12, color: "#388bfd" }}>
        View run details →
      </a>
    </div>
  );
}
