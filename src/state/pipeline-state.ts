import type { LinearIssue } from "../linear/linear-contracts.js";
import type { Flags, PipelineState, Root } from "../types/contracts.js";
import { LinearClient } from "../linear/linear-client.js";
import { config } from "../config.js";
import { logger } from "../util/logger.js";

const linearClient = new LinearClient(config.linearApiKey ?? "", logger);

/**
 * Fetch the full tree of issues needed by the planner, starting from a project
 * URL or an issue identifier. Returns a PipelineState keyed by issue id.
 */
export async function fetchPipelineState(input: string, flags: Flags): Promise<PipelineState> {
  const parsed = LinearClient.parseInput(input);
  const issues: Record<string, LinearIssue> = {};
  let root: Root;

  const visited = new Set<string>();
  const toFetchChildren: string[] = [];

  async function addIssue(issue: LinearIssue, recurseChildren: boolean) {
    if (visited.has(issue.id)) return;
    visited.add(issue.id);
    issues[issue.id] = issue;
    if (recurseChildren && issue.childrenIds.length > 0) {
      toFetchChildren.push(issue.id);
    }
  }

  if (parsed.kind === "project") {
    const project = await linearClient.fetchProject(parsed.value);
    root = { kind: "project", id: project.id, name: project.name, url: project.url, issueIds: project.issues.map((i) => i.id) };
    for (const ti of project.issues) await addIssue(ti, true);
  } else {
    const rootIssue = await linearClient.fetchIssue(parsed.value);
    await addIssue(rootIssue, true);
    // Walk up to the feature / project ancestor so the planner sees the full context.
    let current: LinearIssue | undefined = rootIssue;
    while (current?.parentId) {
      const parent = await linearClient.fetchIssue(current.parentId);
      await addIssue(parent, /* do not re-expand siblings, keep walk focused */ false);
      current = parent;
    }
    root = { kind: "issue", issueId: parsed.value };
  }

  // BFS-fetch children
  while (toFetchChildren.length > 0) {
    const parentId = toFetchChildren.shift();
    if (!parentId) continue;
    const parent = issues[parentId];
    if (!parent) continue;
    const kids = await linearClient.fetchChildrenByParentId(parentId);
    for (const k of kids) await addIssue(k, true);
  }

  // poAutoRemaining starts at flags.maxPoAuto; the orchestrator decrements as it
  // auto-dispatches PO for BA questions.
  const state: PipelineState = {
    root,
    issues,
    poAutoRemaining: flags.lead === "po" ? flags.maxPoAuto : 0,
    fetchedAt: new Date().toISOString(),
  };

  logger.info(
    { rootKind: root.kind, issueCount: Object.keys(issues).length },
    "pipeline state fetched",
  );
  return state;
}

/**
 * Quick terminal check — no actionable work remaining.
 * Terminal when every issue is Done/Canceled/Duplicate, OR every non-terminal issue is
 * either Agent Working (in flight) or manually held.
 */
export function isTerminal(state: PipelineState): boolean {
  for (const i of Object.values(state.issues)) {
    if (["Done", "Canceled", "Duplicate"].includes(i.status)) continue;
    return false;
  }
  return true;
}
