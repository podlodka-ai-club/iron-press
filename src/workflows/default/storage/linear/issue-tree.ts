import type { LinearClient } from "@/linear/linear-client";
import type { LinearIssue } from "@/linear/linear-contracts";
import type { NodePassCheck } from "@/sdk/workflow";

// ---------------------------------------------------------------------------
// Issue hierarchy
//
// This workflow creates a 3-tier tree in Linear:
//
//   FeatureIssue  ──▶  AgentImpl  ──▶  RepoIssue(s)
//
// AgentImpl issues are identified by their title suffix.
// RepoIssues are children of AgentImpl that lack the suffix.
// ---------------------------------------------------------------------------

export const AGENT_IMPL_RE = / - Agent Implementation$/;

export const TERMINAL_STATUSES = new Set(["Done", "Canceled", "Duplicate"]);
export const WORKING_STATUSES  = new Set([
  "Agent Working",
  "In Progress",
  "In Development",
  "In Review",
]);

export const isAgentImpl = (issue: LinearIssue): boolean => AGENT_IMPL_RE.test(issue.title);
export const isTerminal  = (issue: LinearIssue): boolean => TERMINAL_STATUSES.has(issue.status);
export const isWorking   = (issue: LinearIssue): boolean => WORKING_STATUSES.has(issue.status);

/** Returns Fail when an issue is terminal or already being worked on, null otherwise. */
export function assertActionable(issue: LinearIssue): NodePassCheck {
  if (isTerminal(issue)) return { status: "Fail" };
  if (isWorking(issue))  return { status: "Fail" };
  return { status: null };
}

// ---------------------------------------------------------------------------
// Tree resolution
// ---------------------------------------------------------------------------

/**
 * Walk from any issue id to the AgentImpl in its tree.
 *
 * Handles three entry points:
 *   FeatureIssue  → look for an AgentImpl child
 *   AgentImpl     → return as-is
 *   RepoIssue     → return the AgentImpl parent
 */
export async function resolveAgentImpl(
  linear: LinearClient,
  issueId: string,
): Promise<LinearIssue | null> {
  return resolveAgentImplFrom(linear, await linear.fetchIssue(issueId));
}

export async function resolveAgentImplFrom(
  linear: LinearClient,
  issue: LinearIssue,
): Promise<LinearIssue | null> {
  if (isAgentImpl(issue)) return issue;

  if (issue.parentId) {
    const parent = await linear.fetchIssue(issue.parentId);
    if (isAgentImpl(parent)) return parent;
  }

  const children = await linear.fetchChildrenByParentId(issue.id);
  return children.find(isAgentImpl) ?? null;
}

/**
 * Walk to the actionable RepoIssue under the AgentImpl reachable from issueId.
 * Returns null when no repo issue exists yet, or all candidates are terminal/in-flight.
 */
export async function resolveRepoIssue(
  linear: LinearClient,
  issueId: string,
): Promise<LinearIssue | null> {
  const issue = await linear.fetchIssue(issueId);

  // Fast path: input is already a RepoIssue (its parent is an AgentImpl)
  if (issue.parentId) {
    const parent = await linear.fetchIssue(issue.parentId);
    if (isAgentImpl(parent)) return issue;
  }

  const agentImpl = await resolveAgentImplFrom(linear, issue);
  if (!agentImpl) return null;

  const children = await linear.fetchChildrenByParentId(agentImpl.id);
  return children.find((c) => !isAgentImpl(c) && !isTerminal(c) && !isWorking(c)) ?? null;
}
