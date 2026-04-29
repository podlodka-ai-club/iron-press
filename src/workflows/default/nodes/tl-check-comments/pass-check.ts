import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { getLinear, assertActionable, resolveRepoIssue, findLatestQuestionThread } from "../../storage/linear/index.js";

/**
 * TL-check-comments pass-check.
 *
 * Skip when every question on the RepoIssue is resolved.
 * Run when an unresolved thread exists.
 */
export async function passCheck(
  ctx: NodeContext<{ issueId: string; runId: string }>,
): Promise<NodePassCheck> {
  const linear = getLinear();
  const repo = await resolveRepoIssue(linear, ctx.state.issueId);
  if (!repo) return { status: "Pass" };

  const guard = assertActionable(repo);
  if (guard.status !== null) return guard;

  const thread = findLatestQuestionThread(repo.comments);
  if (!thread) return { status: "Pass" };

  return { status: null };
}
