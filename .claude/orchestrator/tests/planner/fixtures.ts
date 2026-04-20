import type { Flags, LinearIssue, PipelineState } from "../../src/types/contracts.js";

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

export function stateFromIssues(rootId: string, issues: LinearIssue[], overrides?: Partial<PipelineState>): PipelineState {
  const byId: Record<string, LinearIssue> = {};
  for (const i of issues) byId[i.id] = i;
  return {
    root: { kind: "issue", issueId: rootId },
    issues: byId,
    poAutoRemaining: 0,
    fetchedAt: "2026-04-16T00:00:00.000Z",
    ...overrides,
  };
}

export function defaultFlags(overrides?: Partial<Flags>): Flags {
  return {
    ba: "analyze",
    design: "direct",
    lead: "human",
    maxPoAuto: 3,
    dryRun: false,
    maxBudgetUsd: 50,
    noCode: false,
    verbose: false,
    ...overrides,
  };
}
