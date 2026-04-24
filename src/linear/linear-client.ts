import { LinearClient as LinearSDKClient, LinearDocument } from "@linear/sdk";
import { withRetry } from "../util/retry.js";
import { type Logger } from "../util/logger.js";
import {
  type LinearIssue,
  type LinearComment,
  type LinearProject,
  type LinearIssueStatus,
  type ParsedInput,
  LinearIssueStatusSchema,
} from "./linear-contracts.js";

// =============================================================================
// LinearClient
// =============================================================================

export class LinearClient {
  private readonly sdk: LinearSDKClient;
  private readonly logger: Logger;

  constructor(apiKey: string, logger: Logger) {
    if (!apiKey) throw new Error("LINEAR_API_KEY is required");
    this.sdk = new LinearSDKClient({ apiKey });
    this.logger = logger;
  }

  // ===========================================================================
  // Input classification (URL → project / issue id)
  // ===========================================================================

  static parseInput(input: string): ParsedInput {
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

  // ===========================================================================
  // Mapping helpers
  // ===========================================================================

  private normaliseStatus(raw: string | undefined): LinearIssueStatus {
    if (!raw) return "Todo";
    const parsed = LinearIssueStatusSchema.safeParse(raw);
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

  private parseBranchFromDescription(description: string): string | undefined {
    const m = description.match(/(?:^|\n)\s*[*-]?\s*(?:Git\s+)?[Bb]ranch(?:\s+[Nn]ame)?[:\s]+`?([A-Za-z0-9/._-]+)`?/);
    return m?.[1];
  }

  private parseBaseBranchFromDescription(description: string): string | undefined {
    const m = description.match(/(?:^|\n)\s*[*-]?\s*[Bb]ase\s+[Bb]ranch[:\s]+`?([A-Za-z0-9/._-]+)`?/);
    return m?.[1];
  }

  private async hydrateIssue(
    raw: Awaited<ReturnType<LinearSDKClient["issue"]>>,
  ): Promise<LinearIssue> {
    const [state, parent, children, commentConn, labels] = await Promise.all([
      raw.state,
      raw.parent,
      raw.children({ first: 100, includeArchived: false }),
      raw.comments({ first: 100, includeArchived: false, orderBy: LinearDocument.PaginationOrderBy.CreatedAt }),
      raw.labels(),
    ]);

    const comments: LinearComment[] = await Promise.all(
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
        } satisfies LinearComment;
      }),
    );

    const description = raw.description ?? "";
    const branchName = raw.branchName ?? this.parseBranchFromDescription(description);
    const baseBranch = this.parseBaseBranchFromDescription(description);

    return {
      id: raw.identifier,
      uuid: raw.id,
      title: raw.title,
      description,
      status: this.normaliseStatus(state?.name),
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

  // ===========================================================================
  // Issues
  // ===========================================================================

  async fetchIssue(identifier: string): Promise<LinearIssue> {
    return withRetry(`linear.fetchIssue(${identifier})`, async () => {
      this.logger.debug({ identifier }, "linear.fetchIssue");
      const raw = await this.sdk.issue(identifier);
      return this.hydrateIssue(raw);
    });
  }

  async fetchChildrenByParentId(parentIdentifier: string): Promise<LinearIssue[]> {
    return withRetry(`linear.fetchChildrenByParentId(${parentIdentifier})`, async () => {
      this.logger.debug({ parentIdentifier }, "linear.fetchChildrenByParentId");
      const raw = await this.sdk.issue(parentIdentifier);
      const children = await raw.children({ first: 100, includeArchived: false });
      return Promise.all(children.nodes.map((c) => this.hydrateIssue(c)));
    });
  }

  // ===========================================================================
  // Projects
  // ===========================================================================

  async fetchProject(slugOrId: string): Promise<LinearProject> {
    return withRetry(`linear.fetchProject(${slugOrId})`, async () => {
      this.logger.debug({ slugOrId }, "linear.fetchProject");
      let project;
      try {
        project = await this.sdk.project(slugOrId);
      } catch (e) {
        this.logger.debug({ e }, "linear.fetchProject: project(id) failed, searching by slug");
        const { nodes } = await this.sdk.projects({ first: 50 });
        project = nodes.find((p) => p.slugId === slugOrId || p.id === slugOrId);
        if (!project) throw new Error(`Project not found: ${slugOrId}`);
      }
      const issuesConn = await project.issues({ first: 100, includeArchived: false });
      const issues = await Promise.all(issuesConn.nodes.map((i) => this.hydrateIssue(i)));
      return {
        id: project.id,
        name: project.name,
        url: project.url,
        issues,
      };
    });
  }
}
