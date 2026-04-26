import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// =============================================================================
// Schema — mirrors src/sdk/workflow/workflow-definition.ts (canonical source)
// =============================================================================

const NodeStatusSchema = z.enum(["Pass", "Fail", "WaitUserInput"]);

const WorkflowNodeDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.string().min(1),
    model: z.string().min(1),
    maxTurns: z.number().int().positive(),
    budgetUsd: z.number().positive(),
    allowedTools: z.array(z.string()),
    disallowedTools: z.array(z.string()),
    permissionProfile: z.string().min(1),
  })
  .strict();

const WorkflowEdgeDefinitionSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    onStatus: NodeStatusSchema,
  })
  .strict();

const WorkflowDefinitionSchema = z
  .object({
    name: z.string().min(1),
    initialNodeId: z.string().min(1),
    nodes: z.array(WorkflowNodeDefinitionSchema).min(1),
    edges: z.array(WorkflowEdgeDefinitionSchema),
  })
  .strict();

type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// =============================================================================
// Types
// =============================================================================

export interface WorkflowBundle {
  name: string;
  definition: WorkflowDefinition;
  /** nodeId → skill.md text; empty string if the file is absent */
  skills: Record<string, string>;
}

export interface WorkflowSummary {
  name: string;
  nodeCount: number;
  edgeCount: number;
  initialNodeId: string;
}

// =============================================================================
// Readers
// =============================================================================

export function listJsonWorkflows(workflowsDir: string): WorkflowSummary[] {
  if (!existsSync(workflowsDir)) return [];
  const entries = readdirSync(workflowsDir, { withFileTypes: true });
  const summaries: WorkflowSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const wfPath = path.join(workflowsDir, entry.name, "workflow.json");
    if (!existsSync(wfPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(wfPath, "utf8")) as unknown;
      const parsed = WorkflowDefinitionSchema.safeParse(raw);
      if (!parsed.success) continue;
      const def = parsed.data;
      summaries.push({
        name: entry.name,
        nodeCount: def.nodes.length,
        edgeCount: def.edges.length,
        initialNodeId: def.initialNodeId,
      });
    } catch {
      // skip malformed dirs
    }
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export function readWorkflow(workflowsDir: string, name: string): WorkflowBundle | null {
  const wfDir = path.join(workflowsDir, name);
  const wfPath = path.join(wfDir, "workflow.json");
  if (!existsSync(wfPath)) return null;

  let definition: WorkflowDefinition;
  try {
    const raw = JSON.parse(readFileSync(wfPath, "utf8")) as unknown;
    const parsed = WorkflowDefinitionSchema.safeParse(raw);
    if (!parsed.success) return null;
    definition = parsed.data;
  } catch {
    return null;
  }

  const skills: Record<string, string> = {};
  for (const node of definition.nodes) {
    const skillPath = path.join(wfDir, "nodes", node.id, "skill.md");
    skills[node.id] = existsSync(skillPath) ? safeRead(skillPath) : "";
  }

  return { name, definition, skills };
}

export function workflowExists(workflowsDir: string, name: string): boolean {
  return existsSync(path.join(workflowsDir, name, "workflow.json"));
}

// =============================================================================
// Writer
// =============================================================================

export function writeWorkflow(workflowsDir: string, bundle: WorkflowBundle): void {
  const parsed = WorkflowDefinitionSchema.safeParse(bundle.definition);
  if (!parsed.success) {
    throw new Error(`Invalid workflow definition: ${parsed.error.message}`);
  }
  const definition = parsed.data;

  const wfDir = path.join(workflowsDir, bundle.name);
  const nodesDir = path.join(wfDir, "nodes");

  // Remove node directories that are no longer referenced
  if (existsSync(nodesDir)) {
    const newIds = new Set(definition.nodes.map((n) => n.id));
    for (const entry of readdirSync(nodesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !newIds.has(entry.name)) {
        rmSync(path.join(nodesDir, entry.name), { recursive: true, force: true });
      }
    }
  }

  mkdirSync(wfDir, { recursive: true });
  writeFileSync(path.join(wfDir, "workflow.json"), JSON.stringify(definition, null, 2) + "\n", "utf8");

  for (const node of definition.nodes) {
    const content = bundle.skills[node.id] ?? "";
    if (content.length === 0) continue;
    const nodeDir = path.join(nodesDir, node.id);
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(path.join(nodeDir, "skill.md"), content, "utf8");
  }
}

// =============================================================================
// Helpers
// =============================================================================

function safeRead(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}
