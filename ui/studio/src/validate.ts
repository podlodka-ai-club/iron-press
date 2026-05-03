import { z } from "zod";
import type { Edge } from "@xyflow/react";
import type { BuilderNodeData } from "./types.js";
import { hasCycle, getReachable } from "./utils/graph.js";

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

  // 6. Script nodes must have scriptKind
  for (const node of nodes) {
    if (node.data.nodeType === "script" && !node.data.scriptKind) {
      errors.push({ message: `Script node "${node.id}" is missing scriptKind`, blocking: true });
    }
  }

  // 7. Reachability (warn only)
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
