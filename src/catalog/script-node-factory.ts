import { execSync } from "node:child_process";
import type { Node } from "@/sdk/workflow";
import type { RunLog } from "@/runs/run-log";
import { WorktreeNode } from "@/workflows/default/nodes/worktree/index.js";
import { CreateBranchNode } from "@/sdk/node/create-branch-node.js";
import { PullRequestNode } from "@/sdk/node/pull-request-node.js";
import { GithubClient } from "@/github/github-client.js";
import { config } from "@/config.js";
import { logger } from "@/util/logger.js";
import type { WorkflowState } from "@/sdk/workflow/registry.js";

function parseGitRemote(cwd: string): { owner: string; repo: string } {
  const url = execSync("git remote get-url origin", { cwd, encoding: "utf8" }).trim();
  const match = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) throw new Error(`Cannot parse git remote URL: ${url}`);
  return { owner: match[1]!, repo: match[2]! };
}

type ScriptNodeFactory = (
  runLog: RunLog,
  cwd: string,
  cfg?: Record<string, unknown>,
) => Node<WorkflowState>;

// FIXME[api-catalog]: SCRIPT_NODE_FACTORIES — replace with dynamic registry lookup once catalog is a service
export const SCRIPT_NODE_FACTORIES: Record<string, ScriptNodeFactory> = {
  worktree: (runLog, cwd) => new WorktreeNode(runLog, cwd) as Node<WorkflowState>,

  "create-branch": (_rl, cwd, cfg) =>
    new CreateBranchNode<WorkflowState>(
      {
        id: "create-branch",
        name: "Create Branch",
        resolve: (s) =>
          `${String(cfg?.branchPrefix ?? "issue-")}${s.issueId.toLowerCase()}`,
        store: (s, b) => {
          (s as Record<string, unknown>)[String(cfg?.stateKey ?? "branch")] = b;
        },
      },
      cwd,
    ),

  "pull-request": (_rl, cwd, cfg) => {
    const { owner, repo } = parseGitRemote(cwd);
    return new PullRequestNode<WorkflowState>(
      {
        id: "pull-request",
        name: "Create Pull Request",
        cwd,
        resolve: (s) => ({
          owner,
          repo,
          head:
            (s as Record<string, unknown>)[String(cfg?.branchStateKey ?? "branch")] as string ??
            `issue-${s.issueId.toLowerCase()}`,
          base: String(cfg?.baseBranch ?? "main"),
          title: `[${s.issueId}] automated PR`,
        }),
      },
      new GithubClient(config.githubToken, logger),
    );
  },
};
