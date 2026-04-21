import { z } from "zod";

// =============================================================================
// Flags — parsed from CLI
// =============================================================================

export const FlagsSchema = z.object({
  ba: z.enum(["analyze", "slice"]).default("analyze"),
  design: z.enum(["direct", "brainstorm"]).default("direct"),
  lead: z.enum(["human", "po"]).default("human"),
  maxPoAuto: z.number().int().positive().default(3),
  dryRun: z.boolean().default(false),
  maxBudgetUsd: z.number().positive().default(50),
  stages: z.array(z.string()).optional(),
  noCode: z.boolean().default(false),
  resume: z.string().optional(),
  verbose: z.boolean().default(false),
});
export type Flags = z.infer<typeof FlagsSchema>;

// =============================================================================
// Linear domain types
// =============================================================================

export const IssueStatusSchema = z.enum([
  "Backlog",
  "Todo",
  "Agent Working",
  "Agent Blocked",
  "Agent Done",
  "In Progress",
  "In Development",
  "In Review",
  "Done",
  "Canceled",
  "Duplicate",
]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const CommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string().optional(),
  authorType: z.enum(["human", "agent"]).default("human"),
  isResolved: z.boolean().default(false),
});
export type Comment = z.infer<typeof CommentSchema>;

export const IssueTypeSchema = z.enum([
  "Project",
  "FeatureIssue",
  "SlicesParent",
  "Slice",
  "AgentImplementation",
  "RepoIssue",
  "Unknown",
]);
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const LinearIssueSchema = z.object({
  id: z.string(), // e.g. "ENG-534"
  uuid: z.string(), // Linear internal id (required for some mutations)
  title: z.string(),
  description: z.string().default(""),
  status: IssueStatusSchema,
  url: z.string(),
  parentId: z.string().optional(),
  childrenIds: z.array(z.string()).default([]),
  branchName: z.string().optional(),
  baseBranch: z.string().optional(),
  comments: z.array(CommentSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  labels: z.array(z.string()).default([]),
});
export type LinearIssue = z.infer<typeof LinearIssueSchema>;

export const ProjectRootSchema = z.object({
  kind: z.literal("project"),
  id: z.string(), // project slug / uuid
  name: z.string(),
  url: z.string(),
  issueIds: z.array(z.string()).default([]),
});
export type ProjectRoot = z.infer<typeof ProjectRootSchema>;

export const IssueRootSchema = z.object({
  kind: z.literal("issue"),
  issueId: z.string(),
});
export type IssueRoot = z.infer<typeof IssueRootSchema>;

export const RootSchema = z.discriminatedUnion("kind", [ProjectRootSchema, IssueRootSchema]);
export type Root = z.infer<typeof RootSchema>;

// =============================================================================
// Pipeline state — what the planner operates on
// =============================================================================

export const PipelineStateSchema = z.object({
  root: RootSchema,
  issues: z.record(z.string(), LinearIssueSchema), // by id
  // Budget counter for auto-PO dispatches in --lead=po mode.
  poAutoRemaining: z.number().int().nonnegative(),
  fetchedAt: z.string(),
});
export type PipelineState = z.infer<typeof PipelineStateSchema>;

// =============================================================================
// Actions — what the planner emits
// =============================================================================

export const ActionKindSchema = z.enum([
  "ba",
  "ba-slice",
  "ba-check-comments",
  "po",
  "tl",
  "tl-design",
  "tl-design-brainstorm",
  "tl-design-finalize",
  "tl-check-comments",
  "code",
]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

export const ActionSchema = z.object({
  kind: ActionKindSchema,
  issueId: z.string(),
  design: z.enum(["direct", "brainstorm"]).optional(), // for ba-slice
  // Human-readable explanation for logs / dry-run output
  reason: z.string(),
});
export type Action = z.infer<typeof ActionSchema>;

// =============================================================================
// Blockers — deterministic exit state
// =============================================================================

export const BlockerSchema = z.object({
  issueId: z.string(),
  issueUrl: z.string(),
  title: z.string(),
  kind: z.enum([
    "awaiting-human-answer-ba",
    "awaiting-human-answer-tl",
    "awaiting-human-design-choice",
    "awaiting-human-after-po-auto",
    "unknown",
  ]),
  description: z.string(),
  questionThreadBody: z.string().optional(),
});
export type Blocker = z.infer<typeof BlockerSchema>;

// =============================================================================
// Stage result — contract between each SDK stage and the orchestrator
// =============================================================================

export const TokenUsageSchema = z.object({
  input: z.number().nonnegative().default(0),
  output: z.number().nonnegative().default(0),
  cacheRead: z.number().nonnegative().default(0),
  cacheCreation: z.number().nonnegative().default(0),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const StageResultSchema = z.object({
  status: z.enum(["done", "blocked", "failed"]),
  issueIdsCreated: z.array(z.string()).default([]),
  issueIdsUpdated: z.array(z.string()).default([]),
  questionsPosted: z.boolean().default(false),
  blockers: z.array(z.string()).default([]),
  summary: z.string().default(""),
  nextHint: z.string().optional(),
  costUsd: z.number().nonnegative().default(0),
  tokens: TokenUsageSchema.default({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }),
  sessionId: z.string().default(""),
  transcriptPath: z.string().default(""),
  // On failure: an error message the orchestrator will surface
  errorMessage: z.string().optional(),
});
export type StageResult = z.infer<typeof StageResultSchema>;

// Schema as plain-JSON (injected into stage prompts so the LLM knows what to emit)
export const STAGE_RESULT_CONTRACT_MARKDOWN = `
\`\`\`json
{
  "status": "done" | "blocked" | "failed",
  "issueIdsCreated": ["ENG-XXX", ...],
  "issueIdsUpdated": ["ENG-XXX", ...],
  "questionsPosted": boolean,
  "blockers": ["human-readable blocker", ...],
  "summary": "short 1-3 sentence summary of what happened",
  "nextHint": "optional advisory hint for the orchestrator (ignored — Linear is source of truth)",
  "errorMessage": "required only if status is failed"
}
\`\`\`
`;

// =============================================================================
// Work unit (code stage)
// =============================================================================

export const WorkUnitSchema = z.object({
  issueId: z.string(),
  issueUuid: z.string(),
  issueName: z.string(),
  label: z.enum(["Backend", "Frontend"]),
  repoPath: z.string(),
  baseBranch: z.string(),
  branchName: z.string(),
  worktreeDir: z.string(),
  worktreePath: z.string(),
  agentType: z.enum(["rails-backend-dev", "react-frontend-dev"]),
  parentIssueId: z.string(),
});
export type WorkUnit = z.infer<typeof WorkUnitSchema>;

// =============================================================================
// Run metadata
// =============================================================================

export const RunMetaSchema = z.object({
  runId: z.string(),
  rootInput: z.string(),
  flags: FlagsSchema,
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  totalCostUsd: z.number().default(0),
  totalTokens: TokenUsageSchema.default({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }),
  stageCount: z.number().default(0),
  exitCode: z.number().optional(),
});
export type RunMeta = z.infer<typeof RunMetaSchema>;
