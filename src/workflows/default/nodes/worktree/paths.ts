import path from "node:path";

export function worktreeBranchName(issueId: string): string {
  return `agent/${issueId.toLowerCase()}`;
}

export function worktreePathFor(cwd: string, branchName: string): string {
  const dir = branchName.replaceAll("/", "--");
  return path.join(cwd, ".worktrees", dir);
}
