import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { getLinear, assertActionable, resolveAgentImpl, findLatestQuestionThread } from "../../storage/linear/index.js";

/**
 * BA-check-comments pass-check.
 *
 * Skip when every question on the AgentImpl is resolved.
 * Run when an unresolved thread exists — the agent will process answers
 * or post follow-ups.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const agentImpl = await resolveAgentImpl(linear, ctx.state.issueId);
  if (!agentImpl) return { status: "Pass" };

  const guard = assertActionable(agentImpl);
  if (guard.status !== null) return guard;

  const thread = findLatestQuestionThread(agentImpl.comments);
  if (!thread) return { status: "Pass" };

  return { status: null };
}
