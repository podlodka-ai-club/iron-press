import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import {
  assertActionable,
  findUnresolvedQuestionThread,
  getLinear,
  resolveRepoIssue,
} from "../_shared/pass-check-utils.js";

/**
 * TL-check-comments pass-check.
 *
 * Skip rule: every question on the RepoIssue has been resolved — either by
 * Linear's native resolve button or by a follow-up `Resolved` comment. If
 * any question is still unresolved, the node runs.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const repo = await resolveRepoIssue(linear, ctx.state.issueId);
  if (!repo) {
    return { status: "Pass" };
  }

  const guard = assertActionable(repo);
  if (guard.status !== null) return guard;

  const thread = findUnresolvedQuestionThread(repo.comments);
  if (!thread) {
    return { status: "Pass" };
  }

  return { status: null };
}
