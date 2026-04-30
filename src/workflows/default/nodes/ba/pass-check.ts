import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { getLinear, assertActionable, resolveAgentImplFrom } from "../../storage/linear/index.js";

/**
 * BA pass-check.
 *
 * BA's output is the AgentImpl issue with a populated description.
 * Skip when one already exists and is past the initial Todo/Backlog stage
 * with a non-empty description — BA already ran.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const inputIssue = await linear.fetchIssue(ctx.state.issueId);

  const guard = assertActionable(inputIssue);
  if (guard.status !== null) return guard;

  const agentImpl = await resolveAgentImplFrom(linear, inputIssue);
  if (!agentImpl) return { status: null };

  const guardImpl = assertActionable(agentImpl);
  if (guardImpl.status !== null) return guardImpl;

  if (agentImpl.status === "Todo" || agentImpl.status === "Backlog") return { status: null };
  if (!agentImpl.description.trim()) return { status: null };

  return { status: "Pass" };
}
