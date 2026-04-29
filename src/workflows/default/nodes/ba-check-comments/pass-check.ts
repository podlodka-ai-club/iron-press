import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import {
  assertActionable,
  findUnresolvedQuestionThread,
  getLinear,
  resolveAgentImpl,
} from "../_shared/pass-check-utils.js";

/**
 * BA-check-comments pass-check.
 *
 * Skip rule: every question on the AgentImpl has been resolved — either by
 * Linear's native resolve button or by a follow-up `Resolved` comment. If
 * any question is still unresolved, the node runs and decides what to do
 * (process answers, ask follow-ups, post `Resolved`, etc.).
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const agentImpl = await resolveAgentImpl(linear, ctx.state.issueId);
  if (!agentImpl) {
    return { status: "Pass" };
  }

  const guard = assertActionable(agentImpl);
  if (guard.status !== null) return guard;

  const thread = findUnresolvedQuestionThread(agentImpl.comments);
  if (!thread) {
    return { status: "Pass" };
  }

  return { status: null };
}
