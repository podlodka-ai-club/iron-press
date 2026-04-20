import path from "node:path";
import { execa } from "execa";
import { config } from "../../config.js";
import { fetchChildrenByParentId, fetchIssue } from "../../state/linear-client.js";
import { logger } from "../../util/logger.js";
import { repoLabelFromTitle, AGENT_IMPL_SUFFIX_RE } from "../../state/classify.js";
import type { LinearIssue, WorkUnit } from "../../types/contracts.js";

export interface PrepareResult {
  agentImpl: LinearIssue;
  workUnits: WorkUnit[];
  skipped: Array<{ id: string; status: string; reason: string }>;
}

export async function prepareWorkUnits(agentImplId: string): Promise<PrepareResult> {
  const agentImpl = await fetchIssue(agentImplId);
  if (!AGENT_IMPL_SUFFIX_RE.test(agentImpl.title)) {
    throw new Error(`Issue ${agentImplId} is not an Agent Implementation issue`);
  }
  const children = await fetchChildrenByParentId(agentImplId);
  if (children.length === 0) {
    throw new Error(`Issue ${agentImplId} has no repo issues. Run tl first.`);
  }

  const githubUsername = await detectGithubUsername();
  const workUnits: WorkUnit[] = [];
  const skipped: PrepareResult["skipped"] = [];

  for (const child of children) {
    if (child.status !== "Todo") {
      skipped.push({ id: child.id, status: child.status, reason: "not in Todo status" });
      continue;
    }
    const label = repoLabelFromTitle(child.title);
    if (!label) {
      skipped.push({ id: child.id, status: child.status, reason: "title has no recognised repo suffix" });
      continue;
    }
    const repoPath = repoPathForLabel(label);
    const { baseBranch, branchName } = resolveBranches(child, githubUsername);

    // Matches create-worktree.sh: dir = branch with `/` → `-`, path = <repoPath>/.worktrees/<dir>
    const worktreeDir = branchName.replace(/\//g, "-");
    const worktreePath = path.join(repoPath, ".worktrees", worktreeDir);
    const agentType: WorkUnit["agentType"] =
      label === "Backend" ? "rails-backend-dev" : "react-frontend-dev";

    await runCreateWorktree({ repoPath, branchName, baseBranch });
    if (agentType === "rails-backend-dev") {
      await runCopySecrets({ repoPath, worktreePath });
    }

    workUnits.push({
      issueId: child.id,
      issueUuid: child.uuid,
      issueName: child.title,
      label,
      repoPath,
      baseBranch,
      branchName,
      worktreeDir,
      worktreePath,
      agentType,
      parentIssueId: agentImpl.id,
    });
  }

  if (workUnits.length === 0) {
    throw new Error(`No sub-issues in Todo status under ${agentImplId}`);
  }
  return { agentImpl, workUnits, skipped };
}

// =============================================================================
// Helpers
// =============================================================================

function repoPathForLabel(label: "Backend" | "Frontend"): string {
  const map = {
    Backend: "backend-app",
    Frontend: "frontend-app",
  } as const;
  return path.join(config.workspaceRoot, map[label]);
}

function resolveBranches(
  child: LinearIssue,
  githubUsername: string,
): { baseBranch: string; branchName: string } {
  // branchName from the custom Linear field or fallback
  const linearBranch = child.branchName?.trim() || child.id.toLowerCase();
  const branchName = linearBranch.startsWith(`${githubUsername}/`)
    ? linearBranch
    : `${githubUsername}/${linearBranch}`;

  // Base branch from description; if non-main, prefix with username
  let base = child.baseBranch?.trim() || "main";
  if (base !== "main" && !base.startsWith(`${githubUsername}/`)) {
    base = `${githubUsername}/${base}`;
  }
  return { baseBranch: base, branchName };
}

async function detectGithubUsername(): Promise<string> {
  try {
    const { stdout } = await execa("git", ["config", "user.username"]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    /* ignore */
  }
  try {
    const { stdout } = await execa("git", ["config", "github.user"]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    /* ignore */
  }
  try {
    const { stdout } = await execa("git", ["config", "user.email"]);
    const email = stdout.trim();
    if (email) return email.split("@")[0]?.replace(/[^a-zA-Z0-9-]/g, "") || "user";
  } catch {
    /* ignore */
  }
  return "user";
}

async function runCreateWorktree(args: { repoPath: string; branchName: string; baseBranch: string }): Promise<void> {
  const script = path.join(config.engLeadScriptsDir, "create-worktree.sh");
  logger.info({ args }, "creating worktree");
  const { stdout, stderr, exitCode } = await execa(
    "bash",
    [
      script,
      "--repo-path",
      args.repoPath,
      "--branch-name",
      args.branchName,
      "--base-branch",
      args.baseBranch,
    ],
    { reject: false },
  );
  if (exitCode !== 0) {
    throw new Error(`create-worktree.sh failed (exit ${exitCode}): ${stderr || stdout}`);
  }
  logger.debug({ stdout }, "worktree created");
}

async function runCopySecrets(args: { repoPath: string; worktreePath: string }): Promise<void> {
  const script = path.join(config.engLeadScriptsDir, "copy-secrets.sh");
  const { stderr, exitCode } = await execa(
    "bash",
    [script, "--repo-path", args.repoPath, "--worktree-path", args.worktreePath],
    { reject: false },
  );
  if (exitCode !== 0) {
    throw new Error(`copy-secrets.sh failed (exit ${exitCode}): ${stderr}`);
  }
}

export async function removeWorktree(repoPath: string, worktreeDir: string): Promise<void> {
  const script = path.join(config.engLeadScriptsDir, "remove-worktree.sh");
  const { stderr, exitCode } = await execa(
    "bash",
    [script, "--repo-path", repoPath, "--worktree-dir", worktreeDir],
    { reject: false },
  );
  if (exitCode !== 0) {
    logger.warn({ stderr, repoPath, worktreeDir }, "remove-worktree failed (non-fatal)");
  }
}
