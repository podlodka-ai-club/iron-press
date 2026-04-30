import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Mock createWriteStream so tests don't leave open handles after cleanup.
// All other fs functions are kept real so directory / file assertions work.
// ---------------------------------------------------------------------------

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createWriteStream: vi.fn().mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock @/config so createRunLog writes into our temp directory
// ---------------------------------------------------------------------------

const mockConfig = vi.hoisted(() => ({ runsDir: "" }));
vi.mock("@/config", () => ({ config: mockConfig }));

vi.mock("@/util/logger", () => {
  const noop = vi.fn();
  const stub = { info: noop, warn: noop, debug: noop, error: noop, child: () => stub };
  return { logger: stub, childLogger: () => stub };
});

// Import after mocks are registered
import { accumulateCost, createRunLog } from "@/runs/run-log";
import type { StageResult } from "@/types/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStageResult(
  costUsd = 0,
  tokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
): StageResult {
  return {
    status: "done",
    issueIdsCreated: [],
    issueIdsUpdated: [],
    questionsPosted: false,
    blockers: [],
    summary: "",
    costUsd,
    tokens,
    sessionId: "",
    transcriptPath: "",
  };
}

// ---------------------------------------------------------------------------
// createRunLog tests
// ---------------------------------------------------------------------------

describe("createRunLog", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "run-log-test-"));
    mockConfig.runsDir = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the run directory under runsDir", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    expect(existsSync(runLog.runDir)).toBe(true);
    runLog.close();
  });

  it("creates a stages subdirectory inside the run directory", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    expect(existsSync(path.join(runLog.runDir, "stages"))).toBe(true);
    runLog.close();
  });

  it("uses the provided runId instead of generating one", () => {
    const runLog = createRunLog({ runId: "custom-run-id", rootInput: "ENG-1", flags: {} });
    expect(runLog.runId).toBe("custom-run-id");
    expect(runLog.runDir).toBe(path.join(tmpDir, "custom-run-id"));
    runLog.close();
  });

  it("generates a run id matching YYYYMMDD-HHmmss-<rand> when none is provided", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    expect(runLog.runId).toMatch(/^\d{8}-\d{6}-[a-f0-9]{6}$/);
    runLog.close();
  });

  it("exposes runDir derived from runsDir + runId", () => {
    const runLog = createRunLog({ runId: "abc123", rootInput: "ENG-1", flags: {} });
    expect(runLog.runDir).toBe(path.join(tmpDir, "abc123"));
    runLog.close();
  });

  // -------------------------------------------------------------------------
  // openStage
  // -------------------------------------------------------------------------

  it("openStage creates a stage directory with the correct slug", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const stage = runLog.openStage({ kind: "ba", issueId: "ENG-1" });

    expect(existsSync(stage.dir)).toBe(true);
    expect(path.basename(stage.dir)).toBe("0001-ba-ENG-1");
    runLog.close();
  });

  it("openStage increments the index for each call", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const s1 = runLog.openStage({ kind: "ba", issueId: "ENG-1" });
    const s2 = runLog.openStage({ kind: "eng", issueId: "ENG-1" });

    expect(s1.index).toBe(1);
    expect(s2.index).toBe(2);
    expect(path.basename(s1.dir)).toBe("0001-ba-ENG-1");
    expect(path.basename(s2.dir)).toBe("0002-eng-ENG-1");
    runLog.close();
  });

  it("openStage returns all expected file paths inside the stage dir", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const stage = runLog.openStage({ kind: "ba", issueId: "ENG-42" });

    expect(stage.transcriptPath).toBe(path.join(stage.dir, "transcript.jsonl"));
    expect(stage.resultPath).toBe(path.join(stage.dir, "result.json"));
    expect(stage.promptPath).toBe(path.join(stage.dir, "prompt.md"));
    expect(stage.stderrPath).toBe(path.join(stage.dir, "stderr.log"));
    expect(stage.toolCallsPath).toBe(path.join(stage.dir, "tool-calls.jsonl"));
    runLog.close();
  });

  it("openStage sets role and issueId from the descriptor", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const stage = runLog.openStage({ kind: "eng", issueId: "ENG-99" });

    expect(stage.role).toBe("eng");
    expect(stage.issueId).toBe("ENG-99");
    runLog.close();
  });

  // -------------------------------------------------------------------------
  // writeMeta / readMeta
  // -------------------------------------------------------------------------

  it("writeMeta / readMeta round-trips a meta object", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const meta = {
      runId: runLog.runId,
      issueId: "ENG-1",
      workflowName: "simple",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      finalStatus: null,
    };

    runLog.writeMeta(meta as never);
    const read = runLog.readMeta();

    expect(read).toEqual(meta);
    runLog.close();
  });

  it("readMeta returns null when no meta.json exists yet", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const read = runLog.readMeta();
    expect(read).toBeNull();
    runLog.close();
  });

  // -------------------------------------------------------------------------
  // writeState
  // -------------------------------------------------------------------------

  it("writeState writes a parseable state.json", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const state = { issueId: "ENG-1", runId: runLog.runId, branch: "feat/test" };

    runLog.writeState(state as never);

    const raw = readFileSync(path.join(runLog.runDir, "state.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(state);
    runLog.close();
  });

  // -------------------------------------------------------------------------
  // Stage counter resume
  // -------------------------------------------------------------------------

  it("resumes stage counter from pre-existing stage directories", () => {
    const runId = "resume-test-run";
    const stagesDir = path.join(tmpDir, runId, "stages");
    mkdirSync(path.join(stagesDir, "0001-ba-ENG-1"), { recursive: true });
    mkdirSync(path.join(stagesDir, "0003-eng-ENG-1"), { recursive: true }); // non-consecutive gap

    const runLog = createRunLog({ runId, rootInput: "ENG-1", flags: {}, resume: true });
    const stage = runLog.openStage({ kind: "qa", issueId: "ENG-1" });

    // Max existing index was 3, next should be 4
    expect(stage.index).toBe(4);
    runLog.close();
  });

  it("starts stage counter at 1 when no prior stages exist", () => {
    const runLog = createRunLog({ rootInput: "ENG-1", flags: {} });
    const stage = runLog.openStage({ kind: "ba", issueId: "ENG-1" });
    expect(stage.index).toBe(1);
    runLog.close();
  });
});

// ---------------------------------------------------------------------------
// accumulateCost tests
// ---------------------------------------------------------------------------

describe("accumulateCost", () => {
  it("adds costUsd to the accumulator", () => {
    const acc = { usd: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 } };
    accumulateCost(acc, makeStageResult(1.5));
    expect(acc.usd).toBe(1.5);
  });

  it("accumulates costUsd across multiple calls", () => {
    const acc = { usd: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 } };
    accumulateCost(acc, makeStageResult(1.0));
    accumulateCost(acc, makeStageResult(0.5));
    expect(acc.usd).toBeCloseTo(1.5);
  });

  it("accumulates token counts", () => {
    const acc = { usd: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 } };
    accumulateCost(acc, makeStageResult(0, { input: 100, output: 50, cacheRead: 10, cacheCreation: 5 }));
    accumulateCost(acc, makeStageResult(0, { input: 200, output: 75, cacheRead: 20, cacheCreation: 15 }));

    expect(acc.tokens.input).toBe(300);
    expect(acc.tokens.output).toBe(125);
    expect(acc.tokens.cacheRead).toBe(30);
    expect(acc.tokens.cacheCreation).toBe(20);
  });

  it("does not mutate the StageResult argument", () => {
    const acc = { usd: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 } };
    const result = makeStageResult(1.0, { input: 10, output: 5, cacheRead: 0, cacheCreation: 0 });
    accumulateCost(acc, result);
    expect(result.costUsd).toBe(1.0);
    expect(result.tokens.input).toBe(10);
  });

  it("handles zero-cost results without changing the accumulator", () => {
    const acc = { usd: 2.0, tokens: { input: 100, output: 50, cacheRead: 5, cacheCreation: 3 } };
    accumulateCost(acc, makeStageResult(0));
    expect(acc.usd).toBe(2.0);
    expect(acc.tokens.input).toBe(100);
  });
});
