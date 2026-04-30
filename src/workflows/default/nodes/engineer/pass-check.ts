import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { getLinear, assertActionable, resolveRepoIssue } from "../../storage/linear/index.js";

/**
 * Engineer pass-check.
 *
 * The engineer's completion signal is the RepoIssue moving to "Agent Done".
 * Skip when that status is already set.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const repo = await resolveRepoIssue(linear, ctx.state.issueId);
  if (!repo) return { status: null };

  if (repo.status === "Agent Done") return { status: "Pass" };

  return assertActionable(repo);
}
