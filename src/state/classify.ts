import type { LinearIssue, LinearComment as Comment } from "../linear/linear-contracts.js";
import type { IssueType } from "../types/contracts.js";

// =============================================================================
// Title-based classification
// =============================================================================

export const AGENT_IMPL_SUFFIX_RE = / - Agent Implementation$/;
export const SLICES_PARENT_SUFFIX_RE = / - Slices$/;
export const SLICE_PREFIX_RE = /^Slice \d+:/;
export const SLICE_0_RE = /^Slice 0:/;

// Suffixes on Slice 0 while in special states
export const EMPTY_SUFFIX_RE = / - Empty$/;
export const BRAINSTORM_SUFFIX_RE = / - Brainstorm$/;

// Labels attached to repo issues, derived from title suffix
export const REPO_LABEL_RE = / - (Backend|Frontend)$/;

export function classifyIssue(
  issue: LinearIssue,
  issuesById: Record<string, LinearIssue>,
): IssueType {
  if (AGENT_IMPL_SUFFIX_RE.test(issue.title)) return "AgentImplementation";
  if (SLICES_PARENT_SUFFIX_RE.test(issue.title)) return "SlicesParent";
  if (SLICE_PREFIX_RE.test(issue.title)) return "Slice";
  if (issue.parentId) {
    const parent = issuesById[issue.parentId];
    if (parent && AGENT_IMPL_SUFFIX_RE.test(parent.title)) return "RepoIssue";
  }
  // Fall back: if it has no parent but has children that look like Agent Impl / Slices parent, it's a feature issue
  if (!issue.parentId || !issuesById[issue.parentId]) return "FeatureIssue";
  return "FeatureIssue";
}

export function repoLabelFromTitle(title: string): "Backend" | "Frontend" | null {
  const m = title.match(REPO_LABEL_RE);
  if (!m) return null;
  return m[1] as "Backend" | "Frontend";
}

export function sliceNumberFromTitle(title: string): number | null {
  const m = title.match(/^Slice (\d+):/);
  return m && m[1] ? Number(m[1]) : null;
}

// =============================================================================
// Comment parsing
// =============================================================================

export interface QuestionThread {
  comment: Comment;
  askedBy: "BA" | "TL" | "PO" | "Unknown";
}

export function findLatestQuestionThread(comments: Comment[]): QuestionThread | null {
  // Sort ascending by createdAt, take the last `## Questions from …` comment
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const c = sorted[i];
    if (!c) continue;
    const body = c.body.trim();
    if (/^##\s*Questions from/i.test(body)) {
      let askedBy: "BA" | "TL" | "PO" | "Unknown" = "Unknown";
      if (/Questions from BA/i.test(body)) askedBy = "BA";
      else if (/Questions from (Tech Lead|TL)/i.test(body)) askedBy = "TL";
      else if (/Questions from PO/i.test(body)) askedBy = "PO";
      return { comment: c, askedBy };
    }
  }
  return null;
}

/**
 * Did anyone reply (in a non-agent comment that isn't just "Resolved") after the given thread's createdAt?
 * Heuristic: any comment created after the thread that doesn't itself start with `## Questions from`
 * and doesn't look like an agent-authored system comment.
 */
export function hasHumanReplyAfter(thread: QuestionThread, comments: Comment[]): boolean {
  const afterTs = thread.comment.createdAt;
  return comments.some((c) => {
    if (c.id === thread.comment.id) return false;
    if (c.createdAt <= afterTs) return false;
    const body = c.body.trim();
    if (/^##\s*Questions from/i.test(body)) return false;
    // Skip pure "Resolved" markers
    if (/^resolved\.?$/i.test(body)) return false;
    // PO/BA agent replies are human-authored in Linear but marked as agent via authorType when we fetch.
    if (c.authorType === "agent") return false;
    return true;
  });
}

export function hasPoReviewComment(comments: Comment[]): boolean {
  return comments.some((c) => {
    const body = c.body.trim();
    return /^##\s*PO\s+(Approved|Review\s+Feedback)/i.test(body);
  });
}

export function containsSensitiveKeyword(body: string, keywords: string[]): boolean {
  const lower = body.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}
