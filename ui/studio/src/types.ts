export type NodeStatus = "Pass" | "Fail" | "WaitUserInput";

export interface AgentConfig {
  model: string;
  maxTurns: number;
  budgetUsd: number;
  allowedTools: string[];
  disallowedTools: string[];
  permissionProfile: string;
}

export interface BuilderNodeData extends AgentConfig, Record<string, unknown> {
  label: string;
  role: string;
  skillContent: string;
  isInitial: boolean;
  nodeType: "agent" | "script";
  scriptKind?: string;
  passCheckRef?: string;
  scriptConfig?: Record<string, unknown>;
  readonly?: boolean;
}

export interface AgentTypeInfo {
  role: string;
  label: string;
  color: string;
  defaultNodeId: string;
  defaultSkill: string;
  defaultConfig: AgentConfig;
  nodeType?: "agent" | "script";
  scriptKind?: string;
  defaultPassCheckRef?: string;
  builtin?: boolean;
}

export interface WorkflowDefinition {
  name: string;
  initialNodeId: string;
  nodes: Array<{
    id: string;
    name: string;
    role: string;
    model: string;
    maxTurns: number;
    budgetUsd: number;
    allowedTools: string[];
    disallowedTools: string[];
    permissionProfile: string;
    nodeType?: "agent" | "script";
    scriptKind?: "worktree" | "create-branch" | "pull-request";
    passCheckRef?: string;
    scriptConfig?: Record<string, unknown>;
  }>;
  edges: Array<{ from: string; to: string; onStatus: NodeStatus }>;
}

export interface WorkflowBundle {
  name: string;
  definition: WorkflowDefinition;
  skills: Record<string, string>;
  readonly?: boolean;
}

export interface WorkflowSummary {
  name: string;
  nodeCount: number;
  edgeCount: number;
  initialNodeId: string;
}
