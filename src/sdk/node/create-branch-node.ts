import { execSync } from "node:child_process";
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
export class CreateBranchNode<TState> implements Node<TState> {
  readonly id: string;
  readonly name: string;

  private readonly _cwd: string;
  private readonly _resolve: (state: TState) => string;
  private readonly _store?: (state: TState, branchName: string) => void;

  constructor(config: CreateBranchNodeConfig<TState>, cwd: string) {
    this.id = config.id ?? "create-branch";
    this.name = config.name ?? "Create Branch";
    this._cwd = cwd;
    this._resolve = config.resolve;
    this._store = config.store;
  }

  async execute(ctx: NodeContext<TState>): Promise<{ status: NodeStatus }> {
    const branchName = this._resolve(ctx.state);
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
      return { status: "Pass" };
    } catch (err) {
      console.error("[CreateBranchNode] git checkout -b failed:", err);
      return { status: "Fail" };
    }
  }
}
