import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullRequestNode } from "../../../src/sdk/node/pull-request-node.js";
import type { PullRequestNodeConfig, PullRequestParams } from "../../../src/sdk/node/pull-request-node.js";
import type { GithubClient } from "../../../src/github/github-client.js";
import type { GitHubPullRequest } from "../../../src/github/github-contracts.js";
import type { NodeContext } from "../../../src/sdk/workflow/index.js";

type State = { issueId: string; runId: string; prUrl?: string };

function makePr(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 42,
    title: "feat: auto PR",
    body: null,
    state: "open",
    url: "https://github.com/org/repo/pull/42",
    isDraft: false,
    isMerged: false,
    mergedAt: null,
    headBranch: "feat/x",
    headSha: "abc123",
    baseBranch: "main",
    labels: [],
    author: null,
    assignees: [],
    requestedReviewers: [],
    reviews: [],
    comments: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    closedAt: null,
    mergeable: null,
    ...overrides,
  };
}

function makeClient(pr = makePr()): GithubClient {
  return {
    createPullRequest: vi.fn().mockResolvedValue(pr),
  } as unknown as GithubClient;
}

const DEFAULT_PARAMS: PullRequestParams = {
  owner: "org",
  repo: "repo",
  title: "feat: auto PR",
  head: "feat/x",
  base: "main",
};

function makeConfig(
  overrides: Partial<PullRequestNodeConfig<State>> = {},
): PullRequestNodeConfig<State> {
  return { resolve: () => DEFAULT_PARAMS, ...overrides };
}

function makeCtx(state: State = { issueId: "ENG-1", runId: "run-abc" }): NodeContext<State> {
  return { state, nodeId: "pull-request", visitCount: 0 };
}

describe("PullRequestNode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Constructor defaults
  // ---------------------------------------------------------------------------

  it("uses default id and name when not provided", () => {
    const node = new PullRequestNode(makeConfig(), makeClient());
    expect(node.id).toBe("pull-request");
    expect(node.name).toBe("Create Pull Request");
  });

  it("accepts custom id and name", () => {
    const node = new PullRequestNode(
      makeConfig({ id: "pr", name: "Open PR" }),
      makeClient(),
    );
    expect(node.id).toBe("pr");
    expect(node.name).toBe("Open PR");
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("returns Pass when createPullRequest succeeds", async () => {
    const result = await new PullRequestNode(makeConfig(), makeClient()).execute(makeCtx());
    expect(result.status).toBe("Pass");
  });

  it("forwards owner, repo, title, head, base to client", async () => {
    const client = makeClient();
    const params: PullRequestParams = {
      owner: "my-org",
      repo: "my-repo",
      title: "fix: something",
      head: "fix/branch",
      base: "main",
    };
    await new PullRequestNode(makeConfig({ resolve: () => params }), client).execute(makeCtx());
    expect(client.createPullRequest).toHaveBeenCalledWith("my-org", "my-repo", {
      title: "fix: something",
      head: "fix/branch",
      base: "main",
      body: undefined,
      draft: undefined,
    });
  });

  it("forwards optional body and draft to client", async () => {
    const client = makeClient();
    const params: PullRequestParams = {
      ...DEFAULT_PARAMS,
      body: "PR description",
      draft: true,
    };
    await new PullRequestNode(makeConfig({ resolve: () => params }), client).execute(makeCtx());
    expect(client.createPullRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ body: "PR description", draft: true }),
    );
  });

  it("calls resolve with the current state", async () => {
    const resolve = vi.fn().mockReturnValue(DEFAULT_PARAMS);
    const state: State = { issueId: "ENG-99", runId: "run-xyz" };
    await new PullRequestNode(makeConfig({ resolve }), makeClient()).execute(makeCtx(state));
    expect(resolve).toHaveBeenCalledWith(state);
  });

  it("calls store with state and the created PR", async () => {
    const pr = makePr({ url: "https://github.com/org/repo/pull/99" });
    const store = vi.fn();
    const state: State = { issueId: "ENG-1", runId: "run-abc" };
    await new PullRequestNode(makeConfig({ store }), makeClient(pr)).execute(makeCtx(state));
    expect(store).toHaveBeenCalledWith(state, pr);
  });

  it("returns Pass when no store is provided", async () => {
    const result = await new PullRequestNode(
      makeConfig({ store: undefined }),
      makeClient(),
    ).execute(makeCtx());
    expect(result.status).toBe("Pass");
  });

  // ---------------------------------------------------------------------------
  // Failure path
  // ---------------------------------------------------------------------------

  it("returns Fail when createPullRequest throws", async () => {
    const client = {
      createPullRequest: vi.fn().mockRejectedValue(new Error("502 Bad Gateway")),
    } as unknown as GithubClient;
    const result = await new PullRequestNode(makeConfig(), client).execute(makeCtx());
    expect(result.status).toBe("Fail");
  });

  it("does not call store when createPullRequest throws", async () => {
    const client = {
      createPullRequest: vi.fn().mockRejectedValue(new Error("rate limit")),
    } as unknown as GithubClient;
    const store = vi.fn();
    await new PullRequestNode(makeConfig({ store }), client).execute(makeCtx());
    expect(store).not.toHaveBeenCalled();
  });
});
