import type { LinearIssue } from "../../src/linear/linear-contracts.js";

export function makeIssue(partial: Partial<LinearIssue> & { id: string; title: string; status: LinearIssue["status"] }): LinearIssue {
  return {
    id: partial.id,
    uuid: partial.uuid ?? `uuid-${partial.id}`,
    title: partial.title,
    description: partial.description ?? "",
    status: partial.status,
    url: partial.url ?? `https://linear.app/test/issue/${partial.id}`,
    parentId: partial.parentId,
    childrenIds: partial.childrenIds ?? [],
    branchName: partial.branchName,
    baseBranch: partial.baseBranch,
    comments: partial.comments ?? [],
    createdAt: partial.createdAt ?? "2026-04-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-04-01T00:00:00.000Z",
    labels: partial.labels ?? [],
  };
}
