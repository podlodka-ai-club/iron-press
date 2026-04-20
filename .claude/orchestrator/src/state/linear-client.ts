import { LinearClient, LinearDocument } from "@linear/sdk";
import { config } from "../config.js";
import { withRetry } from "../util/retry.js";
import {
  type Comment,
  type IssueStatus,
  type LinearIssue,
  type ProjectRoot,
  IssueStatusSchema,
} from "../types/contracts.js";
import { logger } from "../util/logger.js";

let _client: LinearClient | null = null;

function getClient(): LinearClient {
  if (!_client) {
    if (!config.linearApiKey) {
      throw new Error("LINEAR_API_KEY not set");
    }
    _client = new LinearClient({ apiKey: config.linearApiKey });
  }
  return _client;
}

// =============================================================================
// Input classification (URL → project / issue id)
// =============================================================================

export interface ParsedInput {
  kind: "project" | "issue";
  value: string; // project slug for project, issue identifier for issue
}

export function parseInput(input: string): ParsedInput {
  const trimmed = input.trim();

  // Linear project URL, e.g. https://linear.app/team/project/my-feature-abc123...
  const projMatch = trimmed.match(/linear\.app\/[^/]+\/project\/([a-zA-Z0-9-]+?)(?:\/|$)/);
  if (projMatch && projMatch[1]) return { kind: "project", value: projMatch[1] };

  // Linear issue URL
  const issueUrlMatch = trimmed.match(/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/);
  if (issueUrlMatch && issueUrlMatch[1]) return { kind: "issue", value: issueUrlMatch[1] };

  // Bare issue identifier
  if (/^[A-Z]+-\d+$/.test(trimmed)) return { kind: "issue", value: trimmed };

  throw new Error(
    `Invalid input: ${input}. Expected issue id (ENG-123), issue URL, or project URL.`,
  );
}

// =============================================================================
// Fetch helpers
// =============================================================================

function normaliseStatus(raw: string | undefined): IssueStatus {
  if (!raw) return "Todo";
  const parsed = IssueStatusSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Linear workspaces may have slightly different status names — map common aliases.
  const lower = raw.toLowerCase();
  if (lower.includes("blocked")) return "Agent Blocked";
  if (lower.includes("agent working")) return "Agent Working";
  if (lower.includes("agent done")) return "Agent Done";
  if (lower.includes("in development")) return "In Development";
  if (lower.includes("in progress")) return "In Progress";
  if (lower.includes("in review")) return "In Review";
  if (lower.includes("done") || lower.includes("completed")) return "Done";
  if (lower.includes("canceled") || lower.includes("cancelled")) return "Canceled";
  if (lower.includes("duplicate")) return "Duplicate";
  if (lower.includes("backlog")) return "Backlog";
  return "Todo";
}

async function hydrateIssue(raw: Awaited<ReturnType<LinearClient["issue"]>>): Promise<LinearIssue> {
  const [state, parent, children, commentConn, labels] = await Promise.all([
    raw.state,
    raw.parent,
    raw.children({ first: 100, includeArchived: false }),
    raw.comments({ first: 100, includeArchived: false, orderBy: LinearDocument.PaginationOrderBy.CreatedAt }),
    raw.labels(),
  ]);

  const comments: Comment[] = await Promise.all(
    commentConn.nodes.map(async (c) => {
      const userPromise = c.user;
      const user = userPromise ? await userPromise : undefined;
      const isAgent = Boolean(user?.name && /claude|agent|bot/i.test(user.name));
      return {
        id: c.id,
        body: c.body ?? "",
        createdAt: c.createdAt.toISOString(),
        authorName: user?.name ?? undefined,
        authorType: isAgent ? "agent" : "human",
        isResolved: Boolean(c.resolvedAt),
      } satisfies Comment;
    }),
  );

  const description = raw.description ?? "";
  // branchName is a built-in field in Linear (git branch name). If not set, fall back to the suggested one.
  const branchName = raw.branchName ?? parseBranchFromDescription(description);
  const baseBranch = parseBaseBranchFromDescription(description);

  return {
    id: raw.identifier,
    uuid: raw.id,
    title: raw.title,
    description,
    status: normaliseStatus(state?.name),
    url: raw.url,
    parentId: parent?.identifier,
    childrenIds: children.nodes.map((c) => c.identifier),
    branchName,
    baseBranch,
    comments,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    labels: labels.nodes.map((l) => l.name),
  };
}

function parseBranchFromDescription(description: string): string | undefined {
  const m = description.match(/(?:^|\n)\s*[*-]?\s*(?:Git\s+)?[Bb]ranch(?:\s+[Nn]ame)?[:\s]+`?([A-Za-z0-9/._-]+)`?/);
  return m?.[1];
}

function parseBaseBranchFromDescription(description: string): string | undefined {
  const m = description.match(/(?:^|\n)\s*[*-]?\s*[Bb]ase\s+[Bb]ranch[:\s]+`?([A-Za-z0-9/._-]+)`?/);
  return m?.[1];
}

// =============================================================================
// Public API
// =============================================================================

export async function fetchIssue(identifier: string): Promise<LinearIssue> {
  return withRetry(`fetchIssue(${identifier})`, async () => {
    const client = getClient();
    const raw = await client.issue(identifier);
    return hydrateIssue(raw);
  });
}

export async function fetchChildrenByParentId(parentIdentifier: string): Promise<LinearIssue[]> {
  return withRetry(`fetchChildrenByParentId(${parentIdentifier})`, async () => {
    const client = getClient();
    const raw = await client.issue(parentIdentifier);
    const children = await raw.children({ first: 100, includeArchived: false });
    return Promise.all(children.nodes.map((c) => hydrateIssue(c)));
  });
}

export async function fetchProject(slugOrId: string): Promise<{ root: ProjectRoot; topIssues: LinearIssue[] }> {
  return withRetry(`fetchProject(${slugOrId})`, async () => {
    const client = getClient();
    // The SDK's `project()` accepts id or slugId; we'll try both.
    let project;
    try {
      project = await client.project(slugOrId);
    } catch (e) {
      logger.debug({ e }, "project(id) failed, searching by slug");
      // Fallback: list projects and match by slugId
      const { nodes } = await client.projects({ first: 50 });
      project = nodes.find((p) => p.slugId === slugOrId || p.id === slugOrId);
      if (!project) throw new Error(`Project not found: ${slugOrId}`);
    }
    const issuesConn = await project.issues({ first: 100, includeArchived: false });
    const topIssues = await Promise.all(issuesConn.nodes.map((i) => hydrateIssue(i)));
    return {
      root: {
        kind: "project",
        id: project.id,
        name: project.name,
        url: project.url,
        issueIds: topIssues.map((i) => i.id),
      },
      topIssues,
    };
  });
}
