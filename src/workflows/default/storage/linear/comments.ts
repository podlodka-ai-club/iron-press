import type { LinearComment } from "@/linear/linear-contracts";

// ---------------------------------------------------------------------------
// Question threads
//
// Agents post questions as Linear comments starting with:
//   ## Questions from <Role>
//
// A thread is resolved when either:
//   - Linear's native "Resolve" button was clicked  (isResolved = true), or
//   - someone posted a standalone "Resolved" reply afterward.
// ---------------------------------------------------------------------------

export interface QuestionThread {
  comment: LinearComment;
  askedBy: "BA" | "TL" | "Engineer" | "Unknown";
}

const QUESTION_HEADING_RE = /^##\s*(Questions?|Clarifying\s+Question)/i;
const RESOLVED_MARKER_RE  = /^Resolved\.?$/i;

function isResolved(question: LinearComment, allComments: LinearComment[]): boolean {
  if (question.isResolved) return true;
  return allComments.some(
    (c) => c.createdAt > question.createdAt && RESOLVED_MARKER_RE.test(c.body.trim()),
  );
}

/**
 * Find the most recent unresolved question comment.
 * Returns null when every question has been answered.
 */
export function findLatestQuestionThread(
  comments: LinearComment[],
): QuestionThread | null {
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (let i = sorted.length - 1; i >= 0; i--) {
    const c = sorted[i]!;
    if (!QUESTION_HEADING_RE.test(c.body.trim())) continue;
    if (isResolved(c, comments)) continue;

    let askedBy: QuestionThread["askedBy"] = "Unknown";
    if (/Questions from BA/i.test(c.body))                  askedBy = "BA";
    else if (/Questions from (Tech Lead|TL)/i.test(c.body)) askedBy = "TL";
    else if (/Questions from Engineer/i.test(c.body))       askedBy = "Engineer";

    return { comment: c, askedBy };
  }

  return null;
}

/**
 * True when a human (not an agent) replied after the question was posted —
 * i.e. an answer exists and the agent can proceed.
 */
export function hasHumanReply(thread: QuestionThread, comments: LinearComment[]): boolean {
  return comments.some((c) => {
    if (c.id === thread.comment.id)              return false;
    if (c.createdAt <= thread.comment.createdAt) return false;
    if (QUESTION_HEADING_RE.test(c.body.trim())) return false;
    if (RESOLVED_MARKER_RE.test(c.body.trim()))  return false;
    if (c.authorType === "agent")                return false;
    return true;
  });
}
