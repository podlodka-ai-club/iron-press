import type { GithubClient } from "@/github/github-client";
import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { worktreeBranchName } from "../worktree/paths.js";

interface PrState {
  issueId: string;
  runId: string;
  branchName?: string;
  baseBranch?: string;
  prUrl?: string;
}

/**
 * Pull-request pass-check.
 *
 * Skip when an open PR for `head=<branch>` and `base=<base>` already exists
 * in `<owner>/<repo>`. Stores the existing PR's URL on `state.prUrl` so the
 * run still surfaces it.
 *
 * GithubClient and repo coordinates are resolved lazily via the factory
 * passed in from the workflow definition (matches how the PR node itself is
 * constructed — the workflow is the only place that knows owner/repo).
 */
export function makePullRequestPassCheck<TState extends PrState>(opts: {
  getClient: () => GithubClient;
  getRepoInfo: () => { owner: string; repo: string };
}): (ctx: NodeContext<TState>) => Promise<NodePassCheck> {
  return async (ctx) => {
    const branchName = ctx.state.branchName ?? worktreeBranchName(ctx.state.issueId);
    const base = ctx.state.baseBranch ?? "main";
    const { owner, repo } = opts.getRepoInfo();

    const client = opts.getClient();
    const prs = await client.listPullRequests(owner, repo, {
      state: "open",
      head: `${owner}:${branchName}`,
      base,
    });
    const open = prs[0];
    if (!open) return { status: null };

    ctx.state.prUrl = open.url;

    return { status: "Pass" };
  };
}
