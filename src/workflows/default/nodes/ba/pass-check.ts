import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import {
  assertActionable,
  getLinear,
  resolveAgentImplFromIssue,
} from "../_shared/pass-check-utils.js";

/**
 * BA pass-check.
 *
 * BA's output is the AgentImplementation child issue (with description). Skip
 * when an AgentImpl already exists for the input id and is past the initial
 * "Todo"/"Backlog" stages (i.e. BA has already produced a description).
 *
 * Fail fast on terminal / in-flight input issues — those should never reach
 * downstream nodes.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const inputIssue = await linear.fetchIssue(ctx.state.issueId);

  const guard = assertActionable(inputIssue);
  if (guard.status !== null) return guard;

  const agentImpl = await resolveAgentImplFromIssue(linear, inputIssue);
  if (!agentImpl) {
    // No AgentImpl yet — BA needs to run.
    return { status: null };
  }

  const guardImpl = assertActionable(agentImpl);
  if (guardImpl.status !== null) return guardImpl;

  if (agentImpl.status === "Todo" || agentImpl.status === "Backlog") {
    return { status: null };
  }

  if (!agentImpl.description.trim()) {
    return { status: null };
  }

  return { status: "Pass" };
}
