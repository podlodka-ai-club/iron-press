import { z } from "zod";
import type { Edge } from "@xyflow/react";
import type { BuilderNodeData } from "./types.js";

// Mirrors WorkflowDefinitionSchema from src/sdk/workflow/workflow-definition.ts
const WorkflowNameSchema = z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, {
  message: "Name must start with a lowercase letter and contain only a-z, 0-9, and hyphens",
});

export interface ValidationError {
  field?: string;
  message: string;
  blocking: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateWorkflow(
  workflowName: string,
  initialNodeId: string,
  nodes: Array<{ id: string; data: BuilderNodeData }>,
  edges: Edge[],
): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Workflow name
  const nameResult = WorkflowNameSchema.safeParse(workflowName);
  if (!nameResult.success) {
    errors.push({
      field: "name",
      message: nameResult.error.errors[0]?.message ?? "Invalid workflow name",
      blocking: true,
    });
  }

  // 2. At least one node
  if (nodes.length === 0) {
    errors.push({ message: "Workflow must have at least one node", blocking: true });
  }

  // 3. initialNodeId exists
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (initialNodeId === "" || !nodeIds.has(initialNodeId)) {
    errors.push({ field: "initialNodeId", message: "Start node is not set or missing", blocking: true });
  }

  // 4. Edge references valid nodes
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({ message: `Edge source "${edge.source}" references unknown node`, blocking: true });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({ message: `Edge target "${edge.target}" references unknown node`, blocking: true });
    }
  }

  // 5. Cycle detection (DFS)
  if (hasCycle(nodes as Array<{ id: string }>, edges)) {
    errors.push({ message: "Workflow contains a cycle", blocking: true });
  }

  // 6. Reachability (warn only)
  if (initialNodeId && nodeIds.has(initialNodeId)) {
    const reachable = getReachable(initialNodeId, edges);
    for (const id of nodeIds) {
      if (!reachable.has(id)) {
        errors.push({ message: `Node "${id}" is not reachable from the start node`, blocking: false });
      }
    }
  }

  const blocking = errors.filter((e) => e.blocking);
  return { valid: blocking.length === 0, errors };
}

function hasCycle(nodes: Array<{ id: string }>, edges: Edge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adj.keys()) color.set(id, WHITE);

  function dfs(u: string): boolean {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) return true;
      if (color.get(v) === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }

  for (const id of adj.keys()) {
    if (color.get(id) === WHITE && dfs(id)) return true;
  }
  return false;
}

function getReachable(startId: string, edges: Edge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const visited = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return visited;
}
