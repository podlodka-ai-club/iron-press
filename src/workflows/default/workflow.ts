import { WorkflowBuilder, type Workflow } from "@/sdk/workflow";
import type { RunLog } from "@/runs/run-log";
import { BaNode } from "./nodes/ba";
import { BaCheckCommentsNode } from "./nodes/ba-check-comments";
import { TlNode } from "./nodes/tl";
import { TlCheckCommentsNode } from "./nodes/tl-check-comments";
import { WorktreeNode } from "./nodes/worktree";
import { EngineerNode } from "./nodes/engineer";

export interface DefaultWorkflowState {
  issueId: string;
  runId: string;
  /** Set by the Worktree node. */
  branchName?: string;
  /** Set by the Worktree node. */
  baseBranch?: string;
  /** Set by the Worktree node. */
  worktreePath?: string;
  /** Set by the PullRequest node after a successful create. */
  prUrl?: string;
}

/**
 * The end-to-end agent pipeline. Takes a Linear issue and drives it from
 * intake to a GitHub PR.
 *
 *   decider → ba → ba-check-comments → tl → worktree → engineer → pull-request
 *
 * Single-repo project — no backend/frontend split. The worktree, engineer,
 * and pull-request nodes all operate against the workflow's `cwd`.
 */
export function defaultWorkflow(
  runLog: RunLog,
  cwd: string,
): Workflow<DefaultWorkflowState> {
  return new WorkflowBuilder<DefaultWorkflowState>()
    .addNode(new BaNode<DefaultWorkflowState>(runLog, cwd))
    .addNode(new BaCheckCommentsNode<DefaultWorkflowState>(runLog, cwd))
    .addNode(new TlNode<DefaultWorkflowState>(runLog, cwd))
    .addNode(new TlCheckCommentsNode<DefaultWorkflowState>(runLog, cwd))
    .addNode(new WorktreeNode<DefaultWorkflowState>(runLog, cwd))
    .addNode(new EngineerNode<DefaultWorkflowState>(runLog, cwd))
    .addEdge("ba", "ba-check-comments", "Pass")
    .addEdge("ba-check-comments", "tl", "Pass")
    .addEdge("tl", "tl-check-comments", "Pass")
    .addEdge("tl-check-comments", "worktree", "Pass")
    .addEdge("worktree", "engineer", "Pass")
    .setInitialNode("ba")
    .build();
}
