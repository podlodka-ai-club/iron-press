import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { GithubClient } from "@/github/github-client";
import type { GitHubPullRequest } from "@/github/github-contracts";
import type { RunLog } from "@/runs/run-log";
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
export class PullRequestNode<TState extends { issueId: string }> implements Node<TState> {
  readonly id: string;
  readonly name: string;

  private readonly _resolve: (state: TState) => PullRequestParams;
  private readonly _store?: (state: TState, pr: GitHubPullRequest) => void;
  private readonly _client: GithubClient;
  private readonly _cwd?: string;
  private readonly _runLog?: RunLog;

  constructor(config: PullRequestNodeConfig<TState>, client: GithubClient, runLog?: RunLog) {
    this.id = config.id ?? "pull-request";
    this.name = config.name ?? "Create Pull Request";
    this._resolve = config.resolve;
    this._store = config.store;
    this._client = client;
    this._cwd = config.cwd;
    this._runLog = runLog;
  }

  async execute(ctx: NodeContext<TState>): Promise<{ status: NodeStatus }> {
    const params = this._resolve(ctx.state);
    const startedAt = new Date().toISOString();
    let status: NodeStatus;
    try {
      if (this._cwd) {
        const alreadyPushed = (() => {
          try {
            execFileSync("git", ["rev-parse", "--verify", `refs/remotes/origin/${params.head}`], {
              cwd: this._cwd,
              stdio: "pipe",
            });
            return true;
          } catch {
            return false;
          }
        })();
        if (!alreadyPushed) {
          execFileSync("git", ["push", "origin", params.head], { cwd: this._cwd, stdio: "pipe" });
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
      status = "Pass";
    } catch (err) {
      console.error("[PullRequestNode] createPullRequest failed:", err);
      status = "Fail";
    }
    this._writeStage(ctx, status, startedAt);
    return { status };
  }

  private _writeStage(ctx: NodeContext<TState>, status: NodeStatus, startedAt: string): void {
    if (!this._runLog) return;
    const dir = this._runLog.openStage({ kind: "pull-request", issueId: ctx.state.issueId });
    writeFileSync(dir.resultPath, JSON.stringify({ status, startedAt, finishedAt: new Date().toISOString() }));
  }
}
