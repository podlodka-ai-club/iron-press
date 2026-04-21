import type { Action, Blocker, Flags, LinearIssue, PipelineState } from "../types/contracts.js";
import {
  BRAINSTORM_SUFFIX_RE,
  EMPTY_SUFFIX_RE,
  SLICE_0_RE,
  classifyIssue,
  containsSensitiveKeyword,
  findLatestQuestionThread,
  hasHumanReplyAfter,
  hasPoReviewComment,
  sliceNumberFromTitle,
} from "../state/classify.js";
import { config } from "../config.js";

// =============================================================================
// Top-level decision
// =============================================================================

export interface DecisionOutcome {
  actions: Action[];
  blockers: Blocker[];
}

export function decide(state: PipelineState, flags: Flags): DecisionOutcome {
  const leaves = walk(state);
  const actions: Action[] = [];
  const blockers: Blocker[] = [];
  let poAutoLeft = state.poAutoRemaining;

  for (const node of leaves) {
    const result = actionForNode(node, state, flags, poAutoLeft);
    if (result.action) {
      if (result.action.kind === "po") poAutoLeft = Math.max(0, poAutoLeft - 1);
      actions.push(result.action);
    }
    if (result.blocker) blockers.push(result.blocker);
  }

  return {
    actions: sortByPriority(actions),
    blockers,
  };
}

// =============================================================================
// Tree walk — collect actionable leaves
// =============================================================================

function walk(state: PipelineState): LinearIssue[] {
  const leaves: LinearIssue[] = [];
  const visited = new Set<string>();

  function visitIssue(issue: LinearIssue) {
    if (visited.has(issue.id)) return;
    visited.add(issue.id);

    const kind = classifyIssue(issue, state.issues);

    // Terminal statuses — skip
    if (["Done", "Canceled", "Duplicate"].includes(issue.status)) return;

    // Leaves emit themselves and recurse into children where appropriate.
    switch (kind) {
      case "FeatureIssue": {
        // Find agent-impl / slices child; recurse into it. If no children, the feature issue itself is actionable.
        const childIssues = childrenOf(issue, state);
        if (childIssues.length === 0) {
          leaves.push(issue);
          return;
        }
        const slicesParent = childIssues.find((c) => classifyIssue(c, state.issues) === "SlicesParent");
        const agentImpl = childIssues.find((c) => classifyIssue(c, state.issues) === "AgentImplementation");
        if (slicesParent) return visitIssue(slicesParent);
        if (agentImpl) return visitIssue(agentImpl);
        // Has children of some other kind — nothing to do
        return;
      }

      case "SlicesParent": {
        // Blocked parents are themselves actionable (check comments). If blocked, push and stop —
        // we don't process slice children until the parent's questions are resolved.
        if (issue.status === "Agent Blocked") {
          leaves.push(issue);
          return;
        }
        if (issue.status === "Agent Working" || issue.status === "In Progress") return;

        const childIssues = childrenOf(issue, state);
        if (childIssues.length === 0 || issue.status === "Todo") {
          // Needs slicing
          leaves.push(issue);
          return;
        }
        // Process slices in order, respecting the one-at-a-time dispatch rule.
        const slices = childIssues
          .filter((c) => classifyIssue(c, state.issues) === "Slice")
          .sort((a, b) => (sliceNumberFromTitle(a.title) ?? 0) - (sliceNumberFromTitle(b.title) ?? 0));

        const eligible: LinearIssue[] = [];
        for (const s of slices) {
          // Existing Agent Impl child means deps are already satisfied — always process
          if (hasAgentImplChild(s, state)) {
            visitIssue(s);
            continue;
          }
          // For new slices, ensure dependency slices are Done (we approximate using numeric ordering
          // — slicing logic guarantees later slices depend on earlier ones). A richer deps parser can
          // be added by reading the Slices table from the parent description.
          const priorSlices = slices.filter(
            (x) => (sliceNumberFromTitle(x.title) ?? 0) < (sliceNumberFromTitle(s.title) ?? 0),
          );
          const allPriorDone = priorSlices.every((p) => p.status === "Done");
          if (allPriorDone) eligible.push(s);
        }
        // One-at-a-time for new slices
        if (eligible.length > 0) {
          const first = eligible[0];
          if (first) visitIssue(first);
        }
        return;
      }

      case "Slice": {
        if (issue.status === "Agent Working" || issue.status === "In Progress") return;
        if (issue.status === "Agent Blocked") {
          leaves.push(issue);
          return;
        }
        // Slice 0 design suffixes
        if (SLICE_0_RE.test(issue.title)) {
          if (EMPTY_SUFFIX_RE.test(issue.title)) {
            leaves.push(issue); // needs design
            return;
          }
          if (BRAINSTORM_SUFFIX_RE.test(issue.title) && issue.status === "Agent Done") {
            leaves.push(issue); // needs design-finalize
            return;
          }
        }
        // Look for Agent Impl child
        const kids = childrenOf(issue, state);
        const agentImpl = kids.find((c) => classifyIssue(c, state.issues) === "AgentImplementation");
        if (agentImpl) return visitIssue(agentImpl);
        // No Agent Impl child yet
        leaves.push(issue);
        return;
      }

      case "AgentImplementation": {
        if (issue.status === "Agent Working" || issue.status === "In Progress") return;
        if (issue.status === "Agent Blocked" || issue.status === "Todo") {
          leaves.push(issue);
          return;
        }
        if (issue.status === "Agent Done") {
          const kids = childrenOf(issue, state);
          if (kids.length === 0) {
            // No sub-issues yet — the Agent Impl itself is the decision node (po or tl).
            leaves.push(issue);
            return;
          }
          // Has sub-issues: push blocked ones individually so each emits its own
          // tl-check-comments or blocker. Push the Agent Impl itself only when there's
          // work to kick off (a Todo child) and nothing is in-flight.
          for (const k of kids) {
            if (k.status === "Agent Blocked") leaves.push(k);
          }
          const anyInFlight = kids.some((k) =>
            ["Agent Working", "In Progress", "In Development", "In Review"].includes(k.status),
          );
          const needsCode = kids.some((k) => k.status === "Todo");
          if (needsCode && !anyInFlight) leaves.push(issue);
          return;
        }
        return;
      }

      case "RepoIssue": {
        // Only reachable when the walker entered from an Agent Impl parent as a blocked child, OR
        // when the orchestrator was invoked directly on a RepoIssue id.
        if (["Agent Working", "In Progress", "In Development", "In Review"].includes(issue.status)) return;
        if (issue.status === "Agent Blocked") {
          leaves.push(issue);
          return;
        }
        // For Todo RepoIssues, the parent Agent Impl is the actual decision node — defer to it.
        if (issue.parentId && state.issues[issue.parentId]) {
          const parent = state.issues[issue.parentId];
          if (parent) visitIssue(parent);
          return;
        }
        // No parent in state (direct input); leave it as-is for the user to inspect.
        return;
      }

      case "Project":
      case "Unknown":
      default:
        return;
    }
  }

  // Entry: walk from root
  if (state.root.kind === "project") {
    // Process each top-level issue (there's usually one feature/slices parent)
    for (const issueId of state.root.issueIds) {
      const i = state.issues[issueId];
      if (i) visitIssue(i);
    }
    // Special case: empty project
    if (state.root.issueIds.length === 0) {
      // Planner will emit a bootstrap action externally via decide() using flags
      // We represent this as a synthetic "project" leaf here, encoded by an empty root.
    }
  } else {
    const i = state.issues[state.root.issueId];
    if (i) visitIssue(i);
  }

  return leaves;
}

// =============================================================================
// Per-node action selection
// =============================================================================

interface NodeOutcome {
  action?: Action;
  blocker?: Blocker;
}

function actionForNode(
  node: LinearIssue,
  state: PipelineState,
  flags: Flags,
  poAutoLeft: number,
): NodeOutcome {
  const kind = classifyIssue(node, state.issues);

  // --- Agent Blocked: dispatch a check-comments or block on human ---
  if (node.status === "Agent Blocked") return checkCommentsAction(node, state, flags, poAutoLeft);

  // --- Status-agnostic branches below assume non-blocked ---

  if (kind === "FeatureIssue") {
    // No children — bootstrap BA or slice
    if (flags.ba === "slice") {
      return {
        action: {
          kind: "ba-slice",
          issueId: node.id,
          design: flags.design,
          reason: `Feature issue ${node.id} has no children — slicing (design=${flags.design})`,
        },
      };
    }
    return {
      action: {
        kind: "ba",
        issueId: node.id,
        reason: `Feature issue ${node.id} has no children — running BA analyze`,
      },
    };
  }

  if (kind === "SlicesParent") {
    if (node.status === "Todo" || childrenOf(node, state).length === 0) {
      return {
        action: {
          kind: "ba-slice",
          issueId: node.id,
          design: flags.design,
          reason: `Slices parent ${node.id} needs slicing (design=${flags.design})`,
        },
      };
    }
    return {};
  }

  if (kind === "Slice") {
    if (SLICE_0_RE.test(node.title)) {
      if (EMPTY_SUFFIX_RE.test(node.title)) {
        return {
          action: {
            kind: flags.design === "brainstorm" ? "tl-design-brainstorm" : "tl-design",
            issueId: node.id,
            reason: `Slice 0 ${node.id} is Empty — dispatching ${flags.design} design`,
          },
        };
      }
      if (BRAINSTORM_SUFFIX_RE.test(node.title) && node.status === "Agent Done") {
        return {
          action: {
            kind: "tl-design-finalize",
            issueId: node.id,
            reason: `Slice 0 ${node.id} brainstorm complete — finalizing`,
          },
        };
      }
    }
    // Non-Slice-0 that has no Agent Impl child — dispatch BA
    if (!hasAgentImplChild(node, state)) {
      return {
        action: {
          kind: "ba",
          issueId: node.id,
          reason: `Slice ${node.id} has no Agent Implementation — dispatching BA`,
        },
      };
    }
    return {};
  }

  if (kind === "AgentImplementation") {
    if (node.status === "Todo") {
      return { action: { kind: "ba", issueId: node.id, reason: `Agent Impl ${node.id} Todo — running BA` } };
    }
    if (node.status === "Agent Done") {
      const kids = childrenOf(node, state);
      if (kids.length === 0) {
        // No repo issues yet — gate TL behind PO review
        if (hasPoReviewComment(node.comments)) {
          return { action: { kind: "tl", issueId: node.id, reason: `Agent Impl ${node.id} PO-reviewed — running TL` } };
        }
        return { action: { kind: "po", issueId: node.id, reason: `Agent Impl ${node.id} Agent Done — dispatching PO` } };
      }
      // Has repo issues — evaluate in priority order
      return evaluateRepoIssues(node, state, flags);
    }
    return {};
  }

  if (kind === "RepoIssue") {
    if (node.status === "Todo" && !flags.noCode) {
      // Dispatch /code on the parent Agent Impl id (orchestrator dedupes at dispatch time)
      const parent = node.parentId ? state.issues[node.parentId] : undefined;
      if (parent) {
        return {
          action: {
            kind: "code",
            issueId: parent.id,
            reason: `Repo issue ${node.id} Todo — dispatching code for parent ${parent.id}`,
          },
        };
      }
    }
    return {};
  }

  return {};
}

function evaluateRepoIssues(agentImpl: LinearIssue, state: PipelineState, flags: Flags): NodeOutcome {
  const kids = childrenOf(agentImpl, state);
  // 1. Blocked children with human replies → tl-check-comments
  for (const k of kids) {
    if (k.status === "Agent Blocked") {
      const thread = findLatestQuestionThread(k.comments);
      if (thread && hasHumanReplyAfter(thread, k.comments)) {
        return {
          action: {
            kind: "tl-check-comments",
            issueId: k.id,
            reason: `Repo issue ${k.id} has human replies — running TL check-comments`,
          },
        };
      }
      // Blocked with no reply → block on human (TL questions always need human)
      return {
        blocker: {
          issueId: k.id,
          issueUrl: k.url,
          title: k.title,
          kind: "awaiting-human-answer-tl",
          description: `Repo issue ${k.id} is Agent Blocked. Answer questions on Linear, then re-run.`,
          questionThreadBody: thread?.comment.body,
        },
      };
    }
  }
  // 2. Any child working → no action for parent
  if (kids.some((k) => ["Agent Working", "In Progress", "In Development"].includes(k.status))) {
    return {};
  }
  // 3. Any child Todo → dispatch code
  if (kids.some((k) => k.status === "Todo") && !flags.noCode) {
    return {
      action: {
        kind: "code",
        issueId: agentImpl.id,
        reason: `Agent Impl ${agentImpl.id} has Todo repo issues — dispatching code`,
      },
    };
  }
  return {};
}

function checkCommentsAction(
  node: LinearIssue,
  state: PipelineState,
  flags: Flags,
  poAutoLeft: number,
): NodeOutcome {
  const thread = findLatestQuestionThread(node.comments);
  if (!thread) {
    // Blocked with no questions — stale state, treat as block for human inspection.
    return {
      blocker: {
        issueId: node.id,
        issueUrl: node.url,
        title: node.title,
        kind: "unknown",
        description: `Issue ${node.id} is Agent Blocked but has no visible questions comment. Inspect manually.`,
      },
    };
  }

  const kind = classifyIssue(node, state.issues);
  const humanReplied = hasHumanReplyAfter(thread, node.comments);

  if (humanReplied) {
    if (kind === "RepoIssue") {
      return {
        action: { kind: "tl-check-comments", issueId: node.id, reason: `Repo issue ${node.id} has human reply` },
      };
    }
    if (kind === "Slice" && SLICE_0_RE.test(node.title)) {
      return {
        action: { kind: "tl-check-comments", issueId: node.id, reason: `Slice 0 ${node.id} has human reply` },
      };
    }
    return {
      action: { kind: "ba-check-comments", issueId: node.id, reason: `${node.id} has human reply` },
    };
  }

  // No human reply yet — decide whether to auto-dispatch PO (for BA questions) or block on human
  const isTlQuestion =
    thread.askedBy === "TL" ||
    kind === "RepoIssue" ||
    (kind === "Slice" && BRAINSTORM_SUFFIX_RE.test(node.title));

  if (isTlQuestion) {
    return {
      blocker: {
        issueId: node.id,
        issueUrl: node.url,
        title: node.title,
        kind:
          kind === "Slice" && BRAINSTORM_SUFFIX_RE.test(node.title)
            ? "awaiting-human-design-choice"
            : "awaiting-human-answer-tl",
        description: `${node.id} has open TL questions. Answer on Linear then re-run.`,
        questionThreadBody: thread.comment.body,
      },
    };
  }

  // BA-class question: either auto-PO (lead=po) or block
  if (flags.lead === "po") {
    if (poAutoLeft <= 0) {
      return {
        blocker: {
          issueId: node.id,
          issueUrl: node.url,
          title: node.title,
          kind: "awaiting-human-after-po-auto",
          description: `PO auto-dispatch budget exhausted (--max-po-auto=${flags.maxPoAuto}). Answer on Linear then re-run.`,
          questionThreadBody: thread.comment.body,
        },
      };
    }
    if (containsSensitiveKeyword(thread.comment.body, config.sensitiveKeywords)) {
      return {
        blocker: {
          issueId: node.id,
          issueUrl: node.url,
          title: node.title,
          kind: "awaiting-human-answer-ba",
          description: `Questions reference sensitive keywords — refusing auto-PO. Answer on Linear then re-run.`,
          questionThreadBody: thread.comment.body,
        },
      };
    }
    // Only Agent Implementation issues have the PO-review skill applicable; for Slices Parent / Slice we
    // still dispatch PO (it can read the whole tree and answer from product context).
    return {
      action: {
        kind: "po",
        issueId: node.id,
        reason: `${node.id} has BA questions — auto-dispatching PO (lead=po)`,
      },
    };
  }

  // --lead=human: for Agent Impl we still dispatch PO as the "first review" step; that's the existing
  // behaviour and matches the skill. For other types, block on human.
  if (kind === "AgentImplementation") {
    return {
      action: {
        kind: "po",
        issueId: node.id,
        reason: `Agent Impl ${node.id} has BA questions — dispatching PO (first review)`,
      },
    };
  }

  return {
    blocker: {
      issueId: node.id,
      issueUrl: node.url,
      title: node.title,
      kind: "awaiting-human-answer-ba",
      description: `${node.id} has BA questions awaiting a human answer. Answer on Linear then re-run.`,
      questionThreadBody: thread.comment.body,
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

function childrenOf(issue: LinearIssue, state: PipelineState): LinearIssue[] {
  const result: LinearIssue[] = [];
  for (const cid of issue.childrenIds) {
    const c = state.issues[cid];
    if (c) result.push(c);
  }
  return result;
}

function hasAgentImplChild(issue: LinearIssue, state: PipelineState): boolean {
  return childrenOf(issue, state).some((c) => classifyIssue(c, state.issues) === "AgentImplementation");
}

/**
 * Priority order (highest-first):
 * 1. check-comments (unblock existing work first)
 * 2. code (implement ready work)
 * 3. tl / tl-design / tl-design-finalize (advance pipeline)
 * 4. po (validate before TL)
 * 5. ba / ba-slice (start new work)
 */
function sortByPriority(actions: Action[]): Action[] {
  const rank = (a: Action): number => {
    if (a.kind === "ba-check-comments" || a.kind === "tl-check-comments") return 0;
    if (a.kind === "code") return 1;
    if (a.kind === "tl" || a.kind === "tl-design" || a.kind === "tl-design-brainstorm" || a.kind === "tl-design-finalize")
      return 2;
    if (a.kind === "po") return 3;
    if (a.kind === "ba" || a.kind === "ba-slice") return 4;
    return 5;
  };
  return [...actions].sort((a, b) => rank(a) - rank(b) || a.issueId.localeCompare(b.issueId));
}

// De-duplicate actions that refer to the same target (e.g. multiple Todo repo issues all map to one `/code` call)
export function dedupeActions(actions: Action[]): Action[] {
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const a of actions) {
    const key = `${a.kind}:${a.issueId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
