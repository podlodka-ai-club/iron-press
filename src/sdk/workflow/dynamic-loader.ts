import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { AgentNode } from "@/sdk/node";
import type { RunLog } from "@/runs/run-log";
import { WorkflowBuilder } from "./builder.js";
import { WorkflowError } from "./contracts.js";
import type { Workflow } from "./contracts.js";
import type { WorkflowState } from "./registry.js";
import { WorkflowDefinitionSchema } from "./workflow-definition.js";
import { resolvePermissionProfile } from "./permission-profiles.js";
import { loadSkillFromPath } from "@/util/skill-loader";

export function loadWorkflowFromJson(
  workflowDir: string,
  runLog: RunLog,
  cwd: string,
): Workflow<WorkflowState> {
  // 1. Read and parse JSON
  const jsonPath = path.join(workflowDir, "workflow.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (err) {
    throw new WorkflowError(
      "VALIDATION_FAILED",
      `Failed to read workflow.json at "${jsonPath}": ${(err as Error).message}`,
      { workflowDir },
    );
  }

  // 2. Validate schema
  const result = WorkflowDefinitionSchema.safeParse(raw);
  if (!result.success) {
    throw new WorkflowError(
      "VALIDATION_FAILED",
      `workflow.json invalid: ${result.error.message}`,
      { workflowDir },
    );
  }
  const def = result.data;

  // 3. Build workflow
  const builder = new WorkflowBuilder<WorkflowState>();

  for (const node of def.nodes) {
    const skillPath = path.join(workflowDir, "nodes", node.id, "skill.md");
    if (!existsSync(skillPath)) {
      throw new Error(
        `skill.md not found for node "${node.id}" at "${skillPath}"`,
      );
    }
    const prompt = loadSkillFromPath(skillPath);
    const canUseTool = resolvePermissionProfile(node.permissionProfile);

    builder.addNode(
      new AgentNode(
        {
          id: node.id,
          name: node.name,
          role: node.role,
          prompt,
          model: node.model,
          maxTurns: node.maxTurns,
          budgetUsd: node.budgetUsd,
          allowedTools: node.allowedTools,
          disallowedTools: node.disallowedTools,
          canUseTool,
        },
        runLog,
        cwd,
      ),
    );
  }

  for (const edge of def.edges) {
    builder.addEdge(edge.from, edge.to, edge.onStatus);
  }

  builder.setInitialNode(def.initialNodeId);
  return builder.build();
}
