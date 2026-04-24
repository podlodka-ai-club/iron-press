import { z } from "zod";

// =============================================================================
// Linear domain types
// =============================================================================

export const LinearIssueStatusSchema = z.enum([
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
export type LinearIssueStatus = z.infer<typeof LinearIssueStatusSchema>;

export const LinearCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string().optional(),
  authorType: z.enum(["human", "agent"]).default("human"),
  isResolved: z.boolean().default(false),
});
export type LinearComment = z.infer<typeof LinearCommentSchema>;

export const LinearIssueSchema = z.object({
  id: z.string(), // e.g. "ENG-534"
  uuid: z.string(), // Linear internal id (required for some mutations)
  title: z.string(),
  description: z.string().default(""),
  status: LinearIssueStatusSchema,
  url: z.string(),
  parentId: z.string().optional(),
  childrenIds: z.array(z.string()).default([]),
  branchName: z.string().optional(),
  baseBranch: z.string().optional(),
  comments: z.array(LinearCommentSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  labels: z.array(z.string()).default([]),
});
export type LinearIssue = z.infer<typeof LinearIssueSchema>;

export const LinearProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  issues: z.array(LinearIssueSchema).default([]),
});
export type LinearProject = z.infer<typeof LinearProjectSchema>;

// =============================================================================
// Input/option types
// =============================================================================

export interface ParsedInput {
  kind: "project" | "issue";
  value: string; // project slug for project, issue identifier for issue
}
