import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { CreateBranchNode } from "../../../src/sdk/node/create-branch-node.js";
import type { NodeContext } from "../../../src/sdk/workflow/index.js";

vi.mock("node:child_process");

type State = { branch?: string };

function makeCtx(state: State = {}): NodeContext<State> {
  return { state, nodeId: "create-branch", visitCount: 0 };
}

function makeNode(branch = "feat/x", store?: (s: State, b: string) => void) {
  return new CreateBranchNode<State>({ resolve: () => branch, store }, "/cwd");
}

describe("CreateBranchNode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Constructor defaults
  // ---------------------------------------------------------------------------

  it("uses default id and name when not provided", () => {
    const node = makeNode();
    expect(node.id).toBe("create-branch");
    expect(node.name).toBe("Create Branch");
  });

  it("accepts custom id and name", () => {
    const node = new CreateBranchNode<State>(
      { id: "branch", name: "Branch", resolve: () => "feat/x" },
      "/cwd",
    );
    expect(node.id).toBe("branch");
    expect(node.name).toBe("Branch");
  });

  // ---------------------------------------------------------------------------
  // Happy path — branch does not yet exist
  // ---------------------------------------------------------------------------

  it("creates the branch and returns Pass when not on target branch", async () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("main\n" as never)   // git rev-parse
      .mockReturnValueOnce(undefined as never);  // git checkout -b

    const result = await makeNode("feat/x").execute(makeCtx());

    expect(result.status).toBe("Pass");
    expect(execFileSync).toHaveBeenCalledTimes(2);
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      "git",
      ["checkout", "-b", "feat/x"],
      expect.objectContaining({ cwd: "/cwd" }),
    );
  });

  it("calls store with the branch name after creating the branch", async () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("main\n" as never)
      .mockReturnValueOnce(undefined as never);

    const state: State = {};
    const store = vi.fn((s: State, b: string) => { s.branch = b; });
    await makeNode("feat/x", store).execute(makeCtx(state));

    expect(store).toHaveBeenCalledWith(state, "feat/x");
    expect(state.branch).toBe("feat/x");
  });

  // ---------------------------------------------------------------------------
  // Already on target branch — no-op
  // ---------------------------------------------------------------------------

  it("skips checkout and returns Pass when already on the target branch", async () => {
    vi.mocked(execFileSync).mockReturnValueOnce("feat/x\n" as never);

    const result = await makeNode("feat/x").execute(makeCtx());

    expect(result.status).toBe("Pass");
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });

  it("still calls store when already on the target branch", async () => {
    vi.mocked(execFileSync).mockReturnValueOnce("feat/x\n" as never);

    const store = vi.fn();
    await makeNode("feat/x", store).execute(makeCtx());

    expect(store).toHaveBeenCalledWith(expect.anything(), "feat/x");
  });

  // ---------------------------------------------------------------------------
  // Failure cases
  // ---------------------------------------------------------------------------

  it("returns Fail when git rev-parse throws", async () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error("not a git repo"); });

    const result = await makeNode().execute(makeCtx());

    expect(result.status).toBe("Fail");
  });

  it("returns Fail when git checkout -b throws", async () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("main\n" as never)
      .mockImplementationOnce(() => { throw new Error("branch already exists"); });

    const result = await makeNode().execute(makeCtx());

    expect(result.status).toBe("Fail");
  });

  it("does not call store on failure", async () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error("fail"); });

    const store = vi.fn();
    await makeNode("feat/x", store).execute(makeCtx());

    expect(store).not.toHaveBeenCalled();
  });
});
