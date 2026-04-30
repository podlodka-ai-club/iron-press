import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { RunLog } from "@/runs/run-log";
import type { Node, NodeContext, NodeStatus } from "@/sdk/workflow";

export interface CreateBranchNodeConfig<TState> {
  id?: string;
  name?: string;
  /** Derive the branch name from current workflow state. */
  resolve: (state: TState) => string;
  /** Optional: write the created branch name back into state for downstream nodes. */
  store?: (state: TState, branchName: string) => void;
}

/**
 * Deterministic workflow node that creates a local git branch in cwd.
 *
 * Runs `git checkout -b <branchName>` and returns Pass on success, Fail on error.
 * Wire it before any node that needs the branch to exist:
 *
 *   new CreateBranchNode(
 *     {
 *       resolve: (state) => `eng/${state.issueId.toLowerCase()}`,
 *       store: (state, branch) => { state.branch = branch; },
 *     },
 *     cwd,
 *   )
 */
export class CreateBranchNode<TState extends { issueId: string }> implements Node<TState> {
  readonly id: string;
  readonly name: string;

  private readonly _cwd: string;
  private readonly _resolve: (state: TState) => string;
  private readonly _store?: (state: TState, branchName: string) => void;
  private readonly _runLog?: RunLog;

  constructor(config: CreateBranchNodeConfig<TState>, cwd: string, runLog?: RunLog) {
    this.id = config.id ?? "create-branch";
    this.name = config.name ?? "Create Branch";
    this._cwd = cwd;
    this._resolve = config.resolve;
    this._store = config.store;
    this._runLog = runLog;
  }

  async execute(ctx: NodeContext<TState>): Promise<{ status: NodeStatus }> {
    const branchName = this._resolve(ctx.state);
    const startedAt = new Date().toISOString();
    let status: NodeStatus;
    try {
      const current = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: this._cwd,
        stdio: "pipe",
        encoding: "utf8",
      }).trim();
      if (current !== branchName) {
        execSync(`git checkout -b ${branchName}`, { cwd: this._cwd, stdio: "pipe" });
      }
      this._store?.(ctx.state, branchName);
      status = "Pass";
    } catch (err) {
      console.error("[CreateBranchNode] git checkout -b failed:", err);
      status = "Fail";
    }
    this._writeStage(ctx, status, startedAt);
    return { status };
  }

  private _writeStage(ctx: NodeContext<TState>, status: NodeStatus, startedAt: string): void {
    if (!this._runLog) return;
    const dir = this._runLog.openStage({ kind: "create-branch", issueId: ctx.state.issueId });
    writeFileSync(dir.resultPath, JSON.stringify({ status, startedAt, finishedAt: new Date().toISOString() }));
  }
}
