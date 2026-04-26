import type { AgentTypeInfo, WorkflowBundle } from "./types.js";

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
