export interface WorkflowConfig {
  /** Working directory for git operations. */
  cwd: string;
  /** Target branch for pull requests. */
  baseBranch: string;
  /** Prefix used when deriving a feature branch name from the issue id. */
  branchPrefix: string;
}

export const defaultConfig: Omit<WorkflowConfig, "cwd"> = {
  baseBranch: "main",
  branchPrefix: "issue-",
};
