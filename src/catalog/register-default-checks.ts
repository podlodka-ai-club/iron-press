import type { NodeContext, NodePassCheck } from "@/sdk/workflow";
import { registerPassCheck } from "./pass-check-registry.js";
import {
  getLinear,
  assertActionable,
  resolveAgentImpl,
  resolveAgentImplFrom,
  resolveRepoIssue,
  isAgentImpl,
  findLatestQuestionThread,
  hasHumanReply,
} from "@/workflows/default/storage/linear/index.js";
import { passCheck as worktreePassCheck } from "@/workflows/default/nodes/worktree/pass-check.js";
import { passCheck as baCheckCommentsPassCheck } from "@/workflows/default/nodes/ba-check-comments/pass-check.js";
import { passCheck as tlCheckCommentsPassCheck } from "@/workflows/default/nodes/tl-check-comments/pass-check.js";

type Ctx = NodeContext<{ issueId: string; runId: string }>;

/**
 * BA pass-check (redesigned).
 *
 * Returns:
 *   Pass         — AgentImpl already has a populated description past Todo stage
 *   WaitUserInput — AgentImpl has an unanswered question thread
 *   Fail         — input issue is terminal or in-flight
 *   null         — run BA normally
 *
 * Merges the logic formerly split between ba/pass-check.ts and ba-check-comments/pass-check.ts.
 */
async function baPassCheck(ctx: Ctx): Promise<NodePassCheck> {
  const linear = getLinear();
  const inputIssue = await linear.fetchIssue(ctx.state.issueId);

  const guard = assertActionable(inputIssue);
  if (guard.status !== null) return guard;

  const agentImpl = await resolveAgentImplFrom(linear, inputIssue);

  // Idempotency: BA already ran and produced output.
  if (agentImpl) {
    const guardImpl = assertActionable(agentImpl);
    if (guardImpl.status !== null) return guardImpl;

    if (
      agentImpl.status !== "Todo" &&
      agentImpl.status !== "Backlog" &&
      agentImpl.description.trim()
    ) {
      return { status: "Pass" };
    }
  }

  // Human gate: unanswered question thread on the AgentImpl.
  if (agentImpl) {
    const thread = findLatestQuestionThread(agentImpl.comments);
    if (thread && !hasHumanReply(thread, agentImpl.comments)) {
      return { status: "WaitUserInput" };
    }
  }

  return { status: null };
}

/**
 * TL pass-check (redesigned).
 *
 * Returns:
 *   Pass         — at least one RepoIssue with a populated description exists
 *   WaitUserInput — RepoIssue has an unanswered question thread
 *   Fail         — AgentImpl is terminal or in-flight
 *   null         — run TL normally
 *
 * Merges the logic formerly split between tl/pass-check.ts and tl-check-comments/pass-check.ts.
 */
async function tlPassCheck(ctx: Ctx): Promise<NodePassCheck> {
  const linear = getLinear();
  const agentImpl = await resolveAgentImpl(linear, ctx.state.issueId);
  if (!agentImpl) return { status: null };

  const guard = assertActionable(agentImpl);
  if (guard.status !== null) return guard;

  const children = await linear.fetchChildrenByParentId(agentImpl.id);
  const hasRepoIssue = children.some((c) => !isAgentImpl(c) && c.description.trim().length > 0);

  if (hasRepoIssue) {
    // Human gate: check for unanswered questions on the RepoIssue.
    const repo = await resolveRepoIssue(linear, ctx.state.issueId);
    if (repo) {
      const thread = findLatestQuestionThread(repo.comments);
      if (thread && !hasHumanReply(thread, repo.comments)) {
        return { status: "WaitUserInput" };
      }
    }
    return { status: "Pass" };
  }

  return { status: null };
}

/**
 * BA idempotency-only pass-check (for the 6-node default-json workflow).
 *
 * Same as baPassCheck but without the WaitUserInput human gate — that gating
 * is handled by ba-check-comments.execute in the 6-node flow.
 */
async function baIdempotencyPassCheck(ctx: Ctx): Promise<NodePassCheck> {
  const linear = getLinear();
  const inputIssue = await linear.fetchIssue(ctx.state.issueId);

  const guard = assertActionable(inputIssue);
  if (guard.status !== null) return guard;

  const agentImpl = await resolveAgentImplFrom(linear, inputIssue);

  if (agentImpl) {
    const guardImpl = assertActionable(agentImpl);
    if (guardImpl.status !== null) return guardImpl;

    if (
      agentImpl.status !== "Todo" &&
      agentImpl.status !== "Backlog" &&
      agentImpl.description.trim()
    ) {
      return { status: "Pass" };
    }
  }

  return { status: null };
}

/**
 * TL idempotency-only pass-check (for the 6-node default-json workflow).
 *
 * Same as tlPassCheck but without the WaitUserInput human gate — that gating
 * is handled by tl-check-comments.execute in the 6-node flow.
 */
async function tlIdempotencyPassCheck(ctx: Ctx): Promise<NodePassCheck> {
  const linear = getLinear();
  const agentImpl = await resolveAgentImpl(linear, ctx.state.issueId);
  if (!agentImpl) return { status: null };

  const guard = assertActionable(agentImpl);
  if (guard.status !== null) return guard;

  const children = await linear.fetchChildrenByParentId(agentImpl.id);
  const hasRepoIssue = children.some((c) => !isAgentImpl(c) && c.description.trim().length > 0);

  if (hasRepoIssue) return { status: "Pass" };

  return { status: null };
}

/**
 * Engineer pass-check.
 *
 * Returns Pass when the RepoIssue is in "Agent Done" status.
 */
async function engineerPassCheck(ctx: Ctx): Promise<NodePassCheck> {
  const linear = getLinear();
  const repo = await resolveRepoIssue(linear, ctx.state.issueId);
  if (!repo) return { status: null };

  if (repo.status === "Agent Done") return { status: "Pass" };

  return assertActionable(repo);
}

/**
 * Register all default pass-checks at process startup.
 * Called from src/index.ts before workflow execution.
 */
export function registerDefaultPassChecks(): void {
  registerPassCheck(
    "linear.ba",
    baPassCheck,
    "Pass if BA done; WaitUserInput if unanswered questions; Fail if terminal",
  );
  registerPassCheck(
    "linear.tl",
    tlPassCheck,
    "Pass if TL done; WaitUserInput if unanswered questions; Fail if terminal",
  );
  registerPassCheck(
    "linear.engineer",
    engineerPassCheck,
    "Pass if Engineer done (Agent Done status); Fail if terminal",
  );
  registerPassCheck(
    "worktree",
    worktreePassCheck as PassCheckFn,
    "Pass if worktree + branch already exist; null to create them",
  );
  registerPassCheck(
    "linear.ba.idempotency",
    baIdempotencyPassCheck,
    "Pass if BA AgentImpl already populated; no WaitUserInput gate (used in 6-node flow)",
  );
  registerPassCheck(
    "linear.tl.idempotency",
    tlIdempotencyPassCheck,
    "Pass if TL RepoIssue already populated; no WaitUserInput gate (used in 6-node flow)",
  );
  registerPassCheck(
    "ba-check-comments",
    baCheckCommentsPassCheck as PassCheckFn,
    "Run if question thread exists on AgentImpl; Pass (skip) if none",
  );
  registerPassCheck(
    "tl-check-comments",
    tlCheckCommentsPassCheck as PassCheckFn,
    "Run if question thread exists on RepoIssue; Pass (skip) if none",
  );
}

type PassCheckFn = (ctx: Ctx) => Promise<NodePassCheck>;
