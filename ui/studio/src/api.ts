import type { AgentTypeInfo, WorkflowBundle } from "./types.js";
import type { AgentDefinition } from "../../catalog-io.js";
import type { RunDetail } from "./run-types.js";

export interface StudioConfig {
  tools: string[];
  roleColors: Record<string, string>;
  statusColors: Record<string, string>;
  permissionProfiles: string[];
  passCheckRefs: Array<{ key: string; description: string }>;
  scriptKinds: string[];
  nodeTypes: Array<{ value: string; label: string; scriptKind?: string }>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${err}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAgentTypes(): Promise<AgentTypeInfo[]> {
  const data = await fetchJson<{ agentTypes: AgentTypeInfo[] }>("/api/studio/agent-types");
  return data.agentTypes;
}

export async function fetchAgents(): Promise<AgentDefinition[]> {
  const data = await fetchJson<{ agents: AgentDefinition[] }>("/api/studio/agents");
  return data.agents;
}

export async function fetchAgent(role: string): Promise<AgentDefinition> {
  return fetchJson<AgentDefinition>(`/api/studio/agents/${encodeURIComponent(role)}`);
}

export async function createAgent(def: AgentDefinition): Promise<void> {
  await fetchJson("/api/studio/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
}

export async function updateAgent(def: AgentDefinition): Promise<void> {
  await fetchJson(`/api/studio/agents/${encodeURIComponent(def.role)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
}

export async function deleteAgent(role: string): Promise<void> {
  await fetchJson(`/api/studio/agents/${encodeURIComponent(role)}`, { method: "DELETE" });
}

export async function fetchConfig(): Promise<StudioConfig> {
  return fetchJson<StudioConfig>("/api/studio/config");
}

export async function fetchWorkflows(): Promise<WorkflowBundle[]> {
  const data = await fetchJson<{ workflows: WorkflowBundle[] }>("/api/studio/workflows");
  return data.workflows;
}

export async function fetchWorkflow(name: string): Promise<WorkflowBundle> {
  return fetchJson<WorkflowBundle>(`/api/studio/workflows/${encodeURIComponent(name)}`);
}

export async function createWorkflow(bundle: WorkflowBundle): Promise<void> {
  await fetchJson("/api/studio/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
}

export async function updateWorkflow(bundle: WorkflowBundle): Promise<void> {
  await fetchJson(`/api/studio/workflows/${encodeURIComponent(bundle.name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
}

export async function deleteWorkflow(name: string): Promise<void> {
  await fetchJson(`/api/studio/workflows/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function fetchRun(runId: string): Promise<RunDetail> {
  return fetchJson<RunDetail>(`/api/runs/${encodeURIComponent(runId)}`);
}

export type SseEventHandlers = Record<string, (data: unknown) => void>;

export function openRunEventsSse(runId: string, handlers: SseEventHandlers): () => void {
  const url = `/api/runs/${encodeURIComponent(runId)}/events`;
  const source = new EventSource(url);

  for (const [eventName, handler] of Object.entries(handlers)) {
    source.addEventListener(eventName, (e: MessageEvent) => {
      try {
        handler(JSON.parse(e.data as string) as unknown);
      } catch {
        // ignore parse errors
      }
    });
  }

  source.addEventListener("error", () => {
    // EventSource auto-reconnects; nothing to do here
  });

  return () => source.close();
}
