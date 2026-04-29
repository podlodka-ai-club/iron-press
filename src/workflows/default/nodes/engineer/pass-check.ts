import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import {
  assertActionable,
  getLinear,
  resolveRepoIssue,
} from "../_shared/pass-check-utils.js";

/**
 * Engineer pass-check.
 *
 * The engineer's signal of completion is the RepoIssue moving to "Agent Done".
 * Skip when the resolved repo issue is already there.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const repo = await resolveRepoIssue(linear, ctx.state.issueId);
  if (!repo) return { status: null };

  if (repo.status === "Agent Done") {
    return { status: "Pass" };
  }

  const guard = assertActionable(repo);
  if (guard.status !== null) return guard;

  return { status: null };
}
