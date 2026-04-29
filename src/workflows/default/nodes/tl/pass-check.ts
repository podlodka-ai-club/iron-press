import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { AGENT_IMPL_SUFFIX_RE } from "@/state/classify";
import {
  assertActionable,
  getLinear,
  resolveAgentImpl,
} from "../_shared/pass-check-utils.js";

/**
 * TL pass-check.
 *
 * TL's output is one or more child RepoIssues under the AgentImpl, each with
 * a non-empty Technical Implementation description. Skip when the AgentImpl
 * already has at least one such child.
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
  const repoIssue = children.find(
    (c) =>
      !AGENT_IMPL_SUFFIX_RE.test(c.title) && c.description.trim().length > 0,
  );
  if (!repoIssue) {
    return { status: null };
  }

  return { status: "Pass" };
}
