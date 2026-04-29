import { config } from "@/config";
import { logger } from "@/util/logger";
import { LinearClient } from "@/linear/linear-client";
import {
  AGENT_IMPL_SUFFIX_RE,
  findLatestQuestionThread,
  hasHumanReplyAfter,
} from "@/state/classify";
import type { LinearIssue, LinearComment } from "@/linear/linear-contracts";
import type { NodePassCheck } from "@/sdk/workflow";

/**
 * Helpers shared by every node's `pass-check.ts`.
 *
 * - `getLinear()` constructs a `LinearClient` from `config.linearApiKey`.
 *   Each call returns a fresh instance; the client is cheap and stateless.
 * - `assertActionable(issue)` returns a Fail result when the issue is in a
 *   terminal or in-flight Linear status. Every `passCheck` calls this first
 *   so we never run a node against a Done/Canceled/working issue.
 * - `resolveAgentImpl` / `resolveRepoIssue` walk the input id (which may be
 *   a FeatureIssue, AgentImpl, or RepoIssue) to the issue this node cares
 *   about — same reasoning the old decider used to centralise.
 */

export const TERMINAL_STATUSES = new Set(["Done", "Canceled", "Duplicate"]);
export const IN_FLIGHT_STATUSES = new Set([
  "Agent Working",
  "In Progress",
  "In Development",
  "In Review",
]);

export function getLinear(): LinearClient {
  if (!config.linearApiKey) {
    throw new Error("LINEAR_API_KEY is not set — pass-check needs Linear API access.");
  }
  return new LinearClient(config.linearApiKey, logger);
}

export function assertActionable(issue: LinearIssue): NodePassCheck {
  if (TERMINAL_STATUSES.has(issue.status)) {
    return { status: "Fail" };
  }
  if (IN_FLIGHT_STATUSES.has(issue.status)) {
    return { status: "Fail" };
  }
  return { status: null };
}

/**
 * Resolve the AgentImpl issue from any input id:
 * - the input is itself an AgentImpl → return as-is
 * - the input is a Feature with an AgentImpl child → return the child
 * - the input is a RepoIssue whose parent is an AgentImpl → return the parent
 * - otherwise → null
 */
export async function resolveAgentImpl(
  linear: LinearClient,
  issueId: string,
): Promise<LinearIssue | null> {
  const issue = await linear.fetchIssue(issueId);
  return resolveAgentImplFromIssue(linear, issue);
}

export async function resolveAgentImplFromIssue(
  linear: LinearClient,
  issue: LinearIssue,
): Promise<LinearIssue | null> {
  if (AGENT_IMPL_SUFFIX_RE.test(issue.title)) {
    return issue;
  }
  if (issue.parentId) {
    const parent = await linear.fetchIssue(issue.parentId);
    if (AGENT_IMPL_SUFFIX_RE.test(parent.title)) return parent;
  }
  const children = await linear.fetchChildrenByParentId(issue.id);
  const agentImpl = children.find((c) => AGENT_IMPL_SUFFIX_RE.test(c.title));
  return agentImpl ?? null;
}

/**
 * Resolve the actionable RepoIssue child of the AgentImpl reachable from the
 * input id. Returns null when the AgentImpl has no child repo issues yet
 * (TL hasn't run) or when every child is terminal/in-flight.
 */
export async function resolveRepoIssue(
  linear: LinearClient,
  issueId: string,
): Promise<LinearIssue | null> {
  const issue = await linear.fetchIssue(issueId);

  // Direct hit: input IS a repo issue (parent is an AgentImpl).
  if (issue.parentId) {
    const parent = await linear.fetchIssue(issue.parentId);
    if (AGENT_IMPL_SUFFIX_RE.test(parent.title)) return issue;
  }

  const agentImpl = await resolveAgentImplFromIssue(linear, issue);
  if (!agentImpl) return null;

  const children = await linear.fetchChildrenByParentId(agentImpl.id);
  const repo = children.find(
    (c) => !TERMINAL_STATUSES.has(c.status) && !IN_FLIGHT_STATUSES.has(c.status),
  );
  return repo ?? null;
}

/**
 * Find the latest unresolved question thread on an issue. We do NOT filter
 * by `askedBy` — the issue type itself disambiguates ownership (questions
 * on an AgentImpl are BA's, questions on a RepoIssue are TL's/engineer's).
 * That avoids missing questions when an agent deviates from the canonical
 * `## Questions from <Role>` heading.
 */
export function findUnresolvedQuestionThread(
  comments: LinearComment[],
): ReturnType<typeof findLatestQuestionThread> {
  return findLatestQuestionThread(comments);
}

export { hasHumanReplyAfter };
