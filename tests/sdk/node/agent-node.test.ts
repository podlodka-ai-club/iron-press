import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentNode } from "@/sdk/node/agent-node";
import { runSession, stableSessionId } from "@/sdk/session";
import type { AgentNodeConfig } from "@/sdk/node/agent-node";
import type { NodeContext, NodeStatus } from "@/sdk/workflow";
import type { RunLog, StageDir } from "@/runs/run-log";

vi.mock("@/sdk/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/sdk/session")>();
  return { ...actual, runSession: vi.fn() };
});

vi.mock("@/util/logger", () => {
  const noop = vi.fn();
  const stub = { info: noop, warn: noop, debug: noop, error: noop, child: () => ({ info: noop, warn: noop, debug: noop, error: noop }) };
  return { logger: stub, childLogger: () => stub };
});

type State = { issueId: string; runId: string };

const DEFAULT_ROLE = "test-role";
const DEFAULT_ISSUE = "ENG-1";
const DEFAULT_RUN_ID = "run-abc";

function makeConfig(prompt = "Fix {{issueId}}"): AgentNodeConfig {
  return {
    id: "test-node",
    name: "Test Node",
    role: DEFAULT_ROLE,
    prompt,
    model: "claude-3-5-sonnet-20241022",
    maxTurns: 10,
    budgetUsd: 1.0,
    allowedTools: [],
    disallowedTools: [],
    canUseTool: () => true,
  };
}

function makeStageDir(base: string, index = 1): StageDir {
  return {
    index,
    role: DEFAULT_ROLE,
    issueId: DEFAULT_ISSUE,
    dir: base,
    transcriptPath: path.join(base, "transcript.jsonl"),
    resultPath: path.join(base, "result.json"),
    promptPath: path.join(base, "prompt.md"),
    stderrPath: path.join(base, "stderr.log"),
    toolCallsPath: path.join(base, "tool-calls.jsonl"),
  };
}

function makeRunLog(stageDir: StageDir): RunLog {
  return {
    runId: DEFAULT_RUN_ID,
    runDir: "/tmp/test-run",
    openStage: vi.fn(() => stageDir),
    appendEvent: vi.fn(),
    writeState: vi.fn(),
    writeMeta: vi.fn(),
    readMeta: vi.fn(() => null),
    close: vi.fn(),
  };
}

function makeCtx(issueId = DEFAULT_ISSUE, runId = DEFAULT_RUN_ID): NodeContext<State> {
  return { state: { issueId, runId }, nodeId: "test-node", visitCount: 0 };
}

function makeResultMsg(status: NodeStatus, costUsd = 0.01): Record<string, unknown> {
  return {
    type: "result",
    structured_output: { status },
    total_cost_usd: costUsd,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 10,
      cache_creation_input_tokens: 5,
    },
  };
}

describe("AgentNode", () => {
  let tmpDir: string;
  let stageDir: StageDir;
  let runLog: RunLog;

  beforeEach(() => {
    vi.resetAllMocks();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "agent-node-test-"));
    stageDir = makeStageDir(tmpDir);
    runLog = makeRunLog(stageDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  it("assigns id and name from config", () => {
    const node = new AgentNode(makeConfig(), runLog, "/cwd");
    expect(node.id).toBe("test-node");
    expect(node.name).toBe("Test Node");
  });

  // ---------------------------------------------------------------------------
  // openStage
  // ---------------------------------------------------------------------------

  it("calls openStage with the node role and issueId from state", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("Pass"));
    await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx("ENG-42"));
    expect(runLog.openStage).toHaveBeenCalledWith({ kind: DEFAULT_ROLE, issueId: "ENG-42" });
  });

  // ---------------------------------------------------------------------------
  // Prompt file
  // ---------------------------------------------------------------------------

  it("substitutes {{issueId}} in the written prompt file", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("Pass"));
    await new AgentNode(makeConfig("Fix {{issueId}} now"), runLog, "/cwd").execute(makeCtx());
    const contents = readFileSync(stageDir.promptPath, "utf8");
    expect(contents).toContain("Fix ENG-1 now");
    expect(contents).not.toContain("{{issueId}}");
  });

  it("writes role and session id header to prompt file", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("Pass"));
    await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    const contents = readFileSync(stageDir.promptPath, "utf8");
    expect(contents).toContain(`role=${DEFAULT_ROLE}`);
    expect(contents).toMatch(/session=[0-9a-f-]{36}/);
  });

  // ---------------------------------------------------------------------------
  // runSession invocation
  // ---------------------------------------------------------------------------

  it("derives sessionId from (role, issueId, runId, stageIndex) and passes it to runSession", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("Pass"));
    await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    const expected = stableSessionId(DEFAULT_ROLE, DEFAULT_ISSUE, DEFAULT_RUN_ID, stageDir.index);
    const actual = vi.mocked(runSession).mock.calls[0]![0].sessionId;
    expect(actual).toBe(expected);
  });

  it("passes outputSchema with Pass/Fail/WaitUserInput enum to runSession", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("Pass"));
    await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    const schema = vi.mocked(runSession).mock.calls[0]![0].outputSchema as {
      properties: { status: { enum: string[] } };
    };
    expect(schema.properties.status.enum).toEqual(
      expect.arrayContaining(["Pass", "Fail", "WaitUserInput"]),
    );
  });

  // ---------------------------------------------------------------------------
  // Success paths
  // ---------------------------------------------------------------------------

  it("returns Pass and writes result.json with status, sessionId, costUsd, tokens", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("Pass", 0.05));
    const result = await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    expect(result.status).toBe("Pass");
    const written = JSON.parse(readFileSync(stageDir.resultPath, "utf8")) as Record<string, unknown>;
    expect(written.status).toBe("Pass");
    expect(written.costUsd).toBe(0.05);
    expect(written).toHaveProperty("sessionId");
    expect(written).toHaveProperty("tokens");
  });

  it("returns Fail and writes result.json on Fail response", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("Fail"));
    const result = await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    expect(result.status).toBe("Fail");
    const written = JSON.parse(readFileSync(stageDir.resultPath, "utf8")) as Record<string, unknown>;
    expect(written.status).toBe("Fail");
  });

  it("returns WaitUserInput and writes result.json on WaitUserInput response", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(makeResultMsg("WaitUserInput"));
    const result = await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    expect(result.status).toBe("WaitUserInput");
    const written = JSON.parse(readFileSync(stageDir.resultPath, "utf8")) as Record<string, unknown>;
    expect(written.status).toBe("WaitUserInput");
  });

  // ---------------------------------------------------------------------------
  // Failure paths
  // ---------------------------------------------------------------------------

  it("returns Fail with errorMessage in result.json when runSession returns null", async () => {
    vi.mocked(runSession).mockResolvedValueOnce(null);
    const result = await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    expect(result.status).toBe("Fail");
    const written = JSON.parse(readFileSync(stageDir.resultPath, "utf8")) as Record<string, unknown>;
    expect(written.status).toBe("Fail");
    expect(typeof written.errorMessage).toBe("string");
  });

  it("returns Fail with errorMessage in result.json when structured_output is invalid", async () => {
    vi.mocked(runSession).mockResolvedValueOnce({
      type: "result",
      structured_output: { status: "NotAValidStatus" },
      total_cost_usd: 0,
    });
    const result = await new AgentNode(makeConfig(), runLog, "/cwd").execute(makeCtx());
    expect(result.status).toBe("Fail");
    const written = JSON.parse(readFileSync(stageDir.resultPath, "utf8")) as Record<string, unknown>;
    expect(written.status).toBe("Fail");
    expect(typeof written.errorMessage).toBe("string");
  });
});
