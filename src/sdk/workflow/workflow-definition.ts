import { z } from "zod";
import { NodeStatusSchema } from "./contracts.js";

export const WorkflowNodeDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  model: z.string().min(1),
  maxTurns: z.number().int().positive(),
  budgetUsd: z.number().positive(),
  allowedTools: z.array(z.string()),
  disallowedTools: z.array(z.string()),
  permissionProfile: z.string().min(1),
  // Extended fields — all optional for backward compatibility
  nodeType: z.enum(["agent", "script"]).optional().default("agent"),
  scriptKind: z.enum(["worktree", "create-branch", "pull-request"]).optional(),
  passCheckRef: z.string().optional(),
  scriptConfig: z.record(z.unknown()).optional(),
});

export const WorkflowEdgeDefinitionSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    onStatus: NodeStatusSchema,
  })
  .strict();

export const WorkflowDefinitionSchema = z.object({
  name: z.string().min(1),
  initialNodeId: z.string().min(1),
  nodes: z.array(WorkflowNodeDefinitionSchema).min(1),
  edges: z.array(WorkflowEdgeDefinitionSchema),
});

export type WorkflowNodeDefinition = z.infer<typeof WorkflowNodeDefinitionSchema>;
export type WorkflowEdgeDefinition = z.infer<typeof WorkflowEdgeDefinitionSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
