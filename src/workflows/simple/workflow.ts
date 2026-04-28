import { execSync } from "node:child_process";
import { WorkflowBuilder, type Workflow } from "@/sdk/workflow";
import type { RunLog } from "@/runs/run-log";
import { PullRequestNode } from "@/sdk/node/pull-request-node";
import { GithubClient } from "@/github/github-client";
import { config } from "@/config";
import { logger } from "@/util/logger";
import { AgentNode } from "@/sdk/node";
import { defaultConfig, type WorkflowConfig } from "./config";

interface SimpleWorkflowState {
  issueId: string;
  runId: string;
  /** Branch pushed by EngNode; defaults to `eng/<issueId>` if unset. */
  branch?: string;
}

function parseGitRemote(cwd: string): { owner: string; repo: string } {
  const url = execSync("git remote get-url origin", {
    cwd,
    encoding: "utf8",
  }).trim();
  const match = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) throw new Error(`Cannot parse git remote URL: ${url}`);
  return { owner: match[1]!, repo: match[2]! };
}

/**
 * BA → Eng → PullRequest.
 *
 * Edge map:
 *   BA           Pass           → Eng
 *   BA           WaitUserInput  → suspend
 *   BA           Fail           → terminate
 *   Eng          Pass           → PullRequest
 *   Eng          WaitUserInput  → suspend
 *   Eng          Fail           → terminate
 *   PullRequest  Pass           → end (done)
 *   PullRequest  Fail           → terminate
 */
export function simpleWorkflow(
  runLog: RunLog,
  cwd: string,
  overrides: Partial<Omit<WorkflowConfig, "cwd">> = {},
): Workflow<SimpleWorkflowState> {
  const wfConfig: WorkflowConfig = {
    ...defaultConfig,
    ...overrides,
    cwd,
  };
  const { owner, repo } = parseGitRemote(wfConfig.cwd);
  const githubClient = new GithubClient(config.githubToken, logger);

  return new WorkflowBuilder<SimpleWorkflowState>()
    .addNode(
      AgentNode.fromMd<SimpleWorkflowState>(
        new URL("clarification.md", import.meta.url),
        runLog,
        wfConfig.cwd,
      ),
    )
    .addNode(
      AgentNode.fromMd<SimpleWorkflowState>(
        new URL("implementation.md", import.meta.url),
        runLog,
        wfConfig.cwd,
      ),
    )
    .addNode(
      new PullRequestNode<SimpleWorkflowState>(
        {
          resolve: (state) => ({
            owner,
            repo,
            head:
              state.branch ??
              `${wfConfig.branchPrefix}${state.issueId.toLowerCase()}`,
            base: wfConfig.baseBranch,
            title: `[${state.issueId}] automated PR`,
          }),
        },
        githubClient,
      ),
    )
    .addEdge("ba", "eng", "Pass")
    .addEdge("eng", "pull-request", "Pass")
    .setInitialNode("ba")
    .build();
}
