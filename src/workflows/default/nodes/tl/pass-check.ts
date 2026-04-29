import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { getLinear, assertActionable, resolveAgentImpl, isAgentImpl } from "../../storage/linear/index.js";

/**
 * TL pass-check.
 *
 * TL's output is one or more RepoIssues under the AgentImpl, each with
 * a non-empty Technical Implementation description.
 * Skip when at least one such issue already exists.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const agentImpl = await resolveAgentImpl(linear, ctx.state.issueId);
  if (!agentImpl) return { status: null };

  const guard = assertActionable(agentImpl);
  if (guard.status !== null) return guard;

  const children = await linear.fetchChildrenByParentId(agentImpl.id);
  const hasRepoIssue = children.some((c) => !isAgentImpl(c) && c.description.trim().length > 0);

  return hasRepoIssue ? { status: "Pass" } : { status: null };
}
