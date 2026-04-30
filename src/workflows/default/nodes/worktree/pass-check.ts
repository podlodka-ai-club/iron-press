import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { worktreeBranchName, worktreePathFor } from "./paths.js";

interface WorktreeState {
  issueId: string;
  runId: string;
  branchName?: string;
  baseBranch?: string;
  worktreePath?: string;
}

/**
 * Worktree pass-check.
 *
 * The node is naturally idempotent — if the branch + worktree directory
 * already exist, there is nothing to do. We populate `state.branchName`,
 * `state.baseBranch`, and `state.worktreePath` so downstream nodes
 * (engineer, pull-request) can read them.
 *
 * Note: this check uses the workflow's cwd (the orchestrator dir), which is
 * what `WorktreeNode.execute` operates against today.
 */
export async function passCheck(
  ctx: NodeContext<WorktreeState>,
): Promise<NodePassCheck> {
  const cwd = process.cwd();
  const branchName = ctx.state.branchName ?? worktreeBranchName(ctx.state.issueId);
  const worktreePath = ctx.state.worktreePath ?? worktreePathFor(cwd, branchName);

  if (!existsSync(worktreePath)) return { status: null };

  // Branch must exist locally and the worktree must be on it.
  let actualBranch = "";
  try {
    actualBranch = execFileSync("git", ["branch", "--show-current"], {
      cwd: worktreePath,
      encoding: "utf8",
    }).trim();
  } catch {
    return { status: null };
  }

  if (actualBranch !== branchName) return { status: null };

  ctx.state.branchName = branchName;
  ctx.state.baseBranch = ctx.state.baseBranch ?? "main";
  ctx.state.worktreePath = worktreePath;

  return { status: "Pass" };
}
