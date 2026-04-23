// Contracts — types, interfaces, and Zod schemas
export type {
  NodeStatus,
  NodeContext,
  Node,
  WorkflowEdge,
  NodeAttributes,
  EdgeAttributes,
  Workflow,
  ExecutionContext,
  HistoryEntry,
  ExecutionResult,
  EngineHooks,
  EngineOptions,
  Engine,
  WorkflowErrorKind,
} from "./contracts.js";

export {
  NODE_STATUSES,
  NodeStatusSchema,
  ExecutionContextSchema,
  HistoryEntrySchema,
  ExecutionResultSchema,
  EngineOptionsSchema,
  WorkflowError,
} from "./contracts.js";

// Builder
export { WorkflowBuilder } from "./builder.js";

// Concrete engine
export { GraphologyEngine } from "./engine.js";

// Workflow registry
export {
  WORKFLOWS,
  DEFAULT_WORKFLOW,
  availableWorkflowNames,
  getWorkflow,
  discoverDynamicWorkflows,
  type WorkflowState,
  type WorkflowFactory,
} from "./registry.js";

// Dynamic workflow definition — schema + types
export {
  WorkflowNodeDefinitionSchema,
  WorkflowEdgeDefinitionSchema,
  WorkflowDefinitionSchema,
  type WorkflowNodeDefinition,
  type WorkflowEdgeDefinition,
  type WorkflowDefinition,
} from "./workflow-definition.js";

// Permission profiles
export { PERMISSION_PROFILES, resolvePermissionProfile } from "./permission-profiles.js";

// Dynamic loader
export { loadWorkflowFromJson } from "./dynamic-loader.js";
