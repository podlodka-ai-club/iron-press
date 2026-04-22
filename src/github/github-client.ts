import { Octokit } from "@octokit/rest";
import { withRetry } from "../util/retry.js";
import { type Logger } from "../util/logger.js";
import {
  type GitHubIssue,
  type GitHubPullRequest,
  type GitHubComment,
  type GitHubUser,
  type GitHubLabel,
  type GitHubReview,
  type CreateIssueInput,
  type UpdateIssueInput,
  type CreatePullRequestInput,
  type UpdatePullRequestInput,
  type MergePullRequestInput,
  type ListIssuesOptions,
  type ListPullRequestsOptions,
} from "./github-contracts.js";

// =============================================================================
// GithubClient
// =============================================================================

export class GithubClient {
  private readonly octokit: Octokit;
  private readonly logger: Logger;

  constructor(accessToken: string, logger: Logger) {
    if (!accessToken) throw new Error("GitHub access token is required");
    this.octokit = new Octokit({ auth: accessToken });
    this.logger = logger;
  }

  // ===========================================================================
  // Mapping helpers
  // ===========================================================================

  private mapUser(raw: { login: string; id: number; avatar_url: string; html_url: string } | null | undefined): GitHubUser | null {
    if (!raw) return null;
    return {
      login: raw.login,
      id: raw.id,
      avatarUrl: raw.avatar_url,
      url: raw.html_url,
    };
  }

  private mapLabel(raw: { id?: number; name?: string; color?: string; description?: string | null }): GitHubLabel {
    return {
      id: raw.id ?? 0,
      name: raw.name ?? "",
      color: raw.color ?? "",
      description: raw.description ?? null,
    };
  }

  private mapComment(raw: {
    id: number;
    body?: string | null;
    created_at: string;
    updated_at: string;
    user?: { login: string; id: number; avatar_url: string; html_url: string } | null;
    html_url: string;
  }): GitHubComment {
    return {
      id: raw.id,
      body: raw.body ?? "",
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      author: this.mapUser(raw.user ?? null),
      url: raw.html_url,
    };
  }

  private mapReview(raw: {
    id: number;
    state: string;
    body: string | null;
    submitted_at?: string | null;
    user?: { login: string; id: number; avatar_url: string; html_url: string } | null;
  }): GitHubReview {
    return {
      id: raw.id,
      state: raw.state as GitHubReview["state"],
      body: raw.body,
      submittedAt: raw.submitted_at ?? null,
      author: this.mapUser(raw.user ?? null),
    };
  }

  // ===========================================================================
  // Issues
  // ===========================================================================

  async fetchIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return withRetry(`github.fetchIssue(${owner}/${repo}#${issueNumber})`, async () => {
      const [issueRes, commentsRes] = await Promise.all([
        this.octokit.issues.get({ owner, repo, issue_number: issueNumber }),
        this.octokit.issues.listComments({ owner, repo, issue_number: issueNumber, per_page: 100 }),
      ]);
      const raw = issueRes.data;
      this.logger.debug({ owner, repo, issueNumber }, "github.fetchIssue");
      return {
        number: raw.number,
        title: raw.title,
        body: raw.body ?? null,
        state: (raw.state === "closed" ? "closed" : "open") as GitHubIssue["state"],
        url: raw.html_url,
        labels: (raw.labels as Array<{ id?: number; name?: string; color?: string; description?: string | null }>).map((l) => this.mapLabel(l)),
        author: this.mapUser(raw.user),
        assignees: (raw.assignees ?? []).map((a) => this.mapUser(a)!),
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        closedAt: raw.closed_at ?? null,
        comments: commentsRes.data.map((c) => this.mapComment(c)),
        pullRequestUrl: raw.pull_request?.html_url ?? null,
      };
    });
  }

  async listIssues(owner: string, repo: string, options: ListIssuesOptions = {}): Promise<GitHubIssue[]> {
    return withRetry(`github.listIssues(${owner}/${repo})`, async () => {
      const res = await this.octokit.issues.listForRepo({
        owner,
        repo,
        state: options.state ?? "open",
        labels: options.labels?.join(","),
        assignee: options.assignee,
        per_page: options.perPage ?? 30,
        page: options.page ?? 1,
      });
      this.logger.debug({ owner, repo, count: res.data.length }, "github.listIssues");
      return Promise.all(
        res.data
          .filter((i) => !i.pull_request)
          .map((i) => this.fetchIssue(owner, repo, i.number)),
      );
    });
  }

  async createIssue(owner: string, repo: string, input: CreateIssueInput): Promise<GitHubIssue> {
    return withRetry(`github.createIssue(${owner}/${repo})`, async () => {
      const res = await this.octokit.issues.create({
        owner,
        repo,
        title: input.title,
        body: input.body,
        labels: input.labels,
        assignees: input.assignees,
      });
      this.logger.info({ owner, repo, number: res.data.number }, "github.createIssue");
      return this.fetchIssue(owner, repo, res.data.number);
    });
  }

  async updateIssue(owner: string, repo: string, issueNumber: number, input: UpdateIssueInput): Promise<GitHubIssue> {
    return withRetry(`github.updateIssue(${owner}/${repo}#${issueNumber})`, async () => {
      await this.octokit.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        title: input.title,
        body: input.body ?? undefined,
        state: input.state,
        labels: input.labels,
        assignees: input.assignees,
      });
      this.logger.info({ owner, repo, issueNumber }, "github.updateIssue");
      return this.fetchIssue(owner, repo, issueNumber);
    });
  }

  async addIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    return withRetry(`github.addIssueComment(${owner}/${repo}#${issueNumber})`, async () => {
      const res = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      this.logger.info({ owner, repo, issueNumber, commentId: res.data.id }, "github.addIssueComment");
      return this.mapComment(res.data);
    });
  }

  // ===========================================================================
  // Pull requests
  // ===========================================================================

  async fetchPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    return withRetry(`github.fetchPullRequest(${owner}/${repo}#${prNumber})`, async () => {
      const [prRes, commentsRes, reviewsRes] = await Promise.all([
        this.octokit.pulls.get({ owner, repo, pull_number: prNumber }),
        this.octokit.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 100 }),
        this.octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
      ]);
      const raw = prRes.data;
      this.logger.debug({ owner, repo, prNumber }, "github.fetchPullRequest");

      let state: GitHubPullRequest["state"] = "open";
      if (raw.merged) state = "merged";
      else if (raw.state === "closed") state = "closed";

      return {
        number: raw.number,
        title: raw.title,
        body: raw.body ?? null,
        state,
        url: raw.html_url,
        isDraft: raw.draft ?? false,
        isMerged: raw.merged ?? false,
        mergedAt: raw.merged_at ?? null,
        headBranch: raw.head.ref,
        headSha: raw.head.sha,
        baseBranch: raw.base.ref,
        labels: raw.labels.map((l) => this.mapLabel(l)),
        author: this.mapUser(raw.user),
        assignees: (raw.assignees ?? []).map((a) => this.mapUser(a)!),
        requestedReviewers: (raw.requested_reviewers ?? [])
          .filter((r) => "login" in r && typeof r.login === "string")
          .map((r) => this.mapUser(r as { login: string; id: number; avatar_url: string; html_url: string })!),
        reviews: reviewsRes.data.map((r) => this.mapReview(r)),
        comments: commentsRes.data.map((c) => this.mapComment(c)),
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        closedAt: raw.closed_at ?? null,
        mergeable: raw.mergeable ?? null,
      };
    });
  }

  async listPullRequests(owner: string, repo: string, options: ListPullRequestsOptions = {}): Promise<GitHubPullRequest[]> {
    return withRetry(`github.listPullRequests(${owner}/${repo})`, async () => {
      const res = await this.octokit.pulls.list({
        owner,
        repo,
        state: options.state ?? "open",
        base: options.base,
        head: options.head,
        per_page: options.perPage ?? 30,
        page: options.page ?? 1,
      });
      this.logger.debug({ owner, repo, count: res.data.length }, "github.listPullRequests");
      return Promise.all(res.data.map((pr) => this.fetchPullRequest(owner, repo, pr.number)));
    });
  }

  async createPullRequest(owner: string, repo: string, input: CreatePullRequestInput): Promise<GitHubPullRequest> {
    return withRetry(`github.createPullRequest(${owner}/${repo})`, async () => {
      const res = await this.octokit.pulls.create({
        owner,
        repo,
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft ?? false,
      });
      this.logger.info({ owner, repo, number: res.data.number }, "github.createPullRequest");
      return this.fetchPullRequest(owner, repo, res.data.number);
    });
  }

  async updatePullRequest(owner: string, repo: string, prNumber: number, input: UpdatePullRequestInput): Promise<GitHubPullRequest> {
    return withRetry(`github.updatePullRequest(${owner}/${repo}#${prNumber})`, async () => {
      await this.octokit.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        title: input.title,
        body: input.body ?? undefined,
        state: input.state,
        base: input.base,
      });
      this.logger.info({ owner, repo, prNumber }, "github.updatePullRequest");
      return this.fetchPullRequest(owner, repo, prNumber);
    });
  }

  async addPullRequestComment(owner: string, repo: string, prNumber: number, body: string): Promise<GitHubComment> {
    return this.addIssueComment(owner, repo, prNumber, body);
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    input: MergePullRequestInput = {},
  ): Promise<{ merged: boolean; sha: string; message: string }> {
    return withRetry(`github.mergePullRequest(${owner}/${repo}#${prNumber})`, async () => {
      const res = await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        commit_title: input.commitTitle,
        commit_message: input.commitMessage,
        merge_method: input.mergeMethod ?? "squash",
      });
      this.logger.info({ owner, repo, prNumber, merged: res.data.merged }, "github.mergePullRequest");
      return {
        merged: res.data.merged,
        sha: res.data.sha ?? "",
        message: res.data.message,
      };
    });
  }

  async requestReview(owner: string, repo: string, prNumber: number, reviewers: string[]): Promise<void> {
    return withRetry(`github.requestReview(${owner}/${repo}#${prNumber})`, async () => {
      await this.octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers,
      });
      this.logger.info({ owner, repo, prNumber, reviewers }, "github.requestReview");
    });
  }
}
