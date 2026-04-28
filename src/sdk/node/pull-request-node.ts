import { execSync } from "node:child_process";
import type { GithubClient } from "@/github/github-client";
import type { GitHubPullRequest } from "@/github/github-contracts";
import type { Node, NodeContext, NodeStatus } from "@/sdk/workflow";

export interface PullRequestParams {
  owner: string;
  repo: string;
  title: string;
  /** Source branch. */
  head: string;
  /** Target branch. */
  base: string;
  body?: string;
  draft?: boolean;
}

export interface PullRequestNodeConfig<TState> {
  id?: string;
  name?: string;
  /** Extract PR params from current workflow state. */
  resolve: (state: TState) => PullRequestParams;
  /** Optional: write the created PR back into state for downstream nodes. */
  store?: (state: TState, pr: GitHubPullRequest) => void;
  /** Working directory for git operations. When provided, the branch is pushed
   *  to origin before creating the PR if it has no remote tracking ref yet. */
  cwd?: string;
}

/**
 * Deterministic workflow node that creates a GitHub pull request.
 *
 * Unlike AgentNode, this node contains no AI session — it calls
 * GithubClient.createPullRequest directly and returns Pass on success,
 * Fail on error.
 *
 * Wire it into a workflow after the node that commits and pushes code:
 *
 *   new PullRequestNode(
 *     {
 *       resolve: (state) => ({
 *         owner: "my-org",
 *         repo:  "my-repo",
 *         head:  state.branch,
 *         base:  "main",
 *         title: `[${state.issueId}] auto PR`,
 *       }),
 *       store: (state, pr) => { state.prUrl = pr.url; },
 *     },
 *     new GithubClient(config.githubToken, logger),
 *   )
 */
export class PullRequestNode<TState> implements Node<TState> {
  readonly id: string;
  readonly name: string;

  private readonly _resolve: (state: TState) => PullRequestParams;
  private readonly _store?: (state: TState, pr: GitHubPullRequest) => void;
  private readonly _client: GithubClient;
  private readonly _cwd?: string;

  constructor(config: PullRequestNodeConfig<TState>, client: GithubClient) {
    this.id = config.id ?? "pull-request";
    this.name = config.name ?? "Create Pull Request";
    this._resolve = config.resolve;
    this._store = config.store;
    this._client = client;
    this._cwd = config.cwd;
  }

  async execute(ctx: NodeContext<TState>): Promise<{ status: NodeStatus }> {
    const params = this._resolve(ctx.state);
    try {
      if (this._cwd) {
        const alreadyPushed = (() => {
          try {
            execSync(`git rev-parse --verify refs/remotes/origin/${params.head}`, {
              cwd: this._cwd,
              stdio: "pipe",
            });
            return true;
          } catch {
            return false;
          }
        })();
        if (!alreadyPushed) {
          execSync(`git push origin ${params.head}`, { cwd: this._cwd, stdio: "pipe" });
        }
      }
      const pr = await this._client.createPullRequest(params.owner, params.repo, {
        title: params.title,
        head: params.head,
        base: params.base,
        body: params.body,
        draft: params.draft,
      });
      this._store?.(ctx.state, pr);
      return { status: "Pass" };
    } catch (err) {
      console.error("[PullRequestNode] createPullRequest failed:", err);
      return { status: "Fail" };
    }
  }
}
