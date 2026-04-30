import type { AgentTypeInfo, WorkflowBundle } from "./types.js";
import type { RunDetail } from "./run-types.js";

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
