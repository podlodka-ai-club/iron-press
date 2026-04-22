import { z } from "zod";

// =============================================================================
// GitHub domain types
// =============================================================================

export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatarUrl: z.string(),
  url: z.string(),
});
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

export const GitHubLabelSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable().default(null),
});
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>;

export const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  author: GitHubUserSchema.nullable().default(null),
  url: z.string(),
});
export type GitHubComment = z.infer<typeof GitHubCommentSchema>;

export const GitHubIssueStateSchema = z.enum(["open", "closed"]);
export type GitHubIssueState = z.infer<typeof GitHubIssueStateSchema>;

export const GitHubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().default(null),
  state: GitHubIssueStateSchema,
  url: z.string(),
  labels: z.array(GitHubLabelSchema).default([]),
  author: GitHubUserSchema.nullable().default(null),
  assignees: z.array(GitHubUserSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable().default(null),
  comments: z.array(GitHubCommentSchema).default([]),
  pullRequestUrl: z.string().nullable().default(null), // set if this issue is linked to a PR
});
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

export const GitHubPRStateSchema = z.enum(["open", "closed", "merged"]);
export type GitHubPRState = z.infer<typeof GitHubPRStateSchema>;

export const GitHubReviewStateSchema = z.enum([
  "PENDING",
  "COMMENTED",
  "APPROVED",
  "CHANGES_REQUESTED",
  "DISMISSED",
]);
export type GitHubReviewState = z.infer<typeof GitHubReviewStateSchema>;

export const GitHubReviewSchema = z.object({
  id: z.number(),
  state: GitHubReviewStateSchema,
  body: z.string().nullable().default(null),
  submittedAt: z.string().nullable().default(null),
  author: GitHubUserSchema.nullable().default(null),
});
export type GitHubReview = z.infer<typeof GitHubReviewSchema>;

export const GitHubPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().default(null),
  state: GitHubPRStateSchema,
  url: z.string(),
  isDraft: z.boolean().default(false),
  isMerged: z.boolean().default(false),
  mergedAt: z.string().nullable().default(null),
  headBranch: z.string(),
  headSha: z.string(),
  baseBranch: z.string(),
  labels: z.array(GitHubLabelSchema).default([]),
  author: GitHubUserSchema.nullable().default(null),
  assignees: z.array(GitHubUserSchema).default([]),
  requestedReviewers: z.array(GitHubUserSchema).default([]),
  reviews: z.array(GitHubReviewSchema).default([]),
  comments: z.array(GitHubCommentSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable().default(null),
  mergeable: z.boolean().nullable().default(null),
});
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;

// =============================================================================
// Input/option types
// =============================================================================

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface UpdateIssueInput {
  title?: string;
  body?: string;
  state?: GitHubIssueState;
  labels?: string[];
  assignees?: string[];
}

export interface CreatePullRequestInput {
  title: string;
  body?: string;
  head: string; // source branch
  base: string; // target branch
  draft?: boolean;
}

export interface UpdatePullRequestInput {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  base?: string;
}

export interface MergePullRequestInput {
  commitTitle?: string;
  commitMessage?: string;
  mergeMethod?: "merge" | "squash" | "rebase";
}

export interface ListIssuesOptions {
  state?: "open" | "closed" | "all";
  labels?: string[];
  assignee?: string;
  perPage?: number;
  page?: number;
}

export interface ListPullRequestsOptions {
  state?: "open" | "closed" | "all";
  base?: string;
  head?: string;
  perPage?: number;
  page?: number;
}
