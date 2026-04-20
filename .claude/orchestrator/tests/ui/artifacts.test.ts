import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { listRuns, readRun, readStage } from "../../ui/artifacts.js";

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(path.join(os.tmpdir(), "orch-ui-test-"));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function scaffoldRun(runId: string, opts: {
  rootInput?: string;
  status?: "running" | "complete" | "blocked" | "failed";
  stages?: { slug: string; result?: Record<string, unknown>; transcriptLines?: number; stderr?: string; startedAt?: string; finishedAt?: string }[];
  blockers?: unknown[];
} = {}): void {
  const runDir = path.join(runsDir, runId);
  mkdirSync(runDir, { recursive: true });
  mkdirSync(path.join(runDir, "stages"), { recursive: true });

  const meta = {
    runId,
    rootInput: opts.rootInput ?? "ENG-100",
    flags: { ba: "analyze", lead: "human", design: "direct" },
    startedAt: "2026-04-17T14:00:00.000Z",
    finishedAt: opts.status && opts.status !== "running" ? "2026-04-17T14:05:00.000Z" : undefined,
    totalCostUsd: 1.23,
    stageCount: opts.stages?.length ?? 0,
    totalTokens: { input: 10, output: 20, cacheRead: 30, cacheCreation: 40 },
  };
  writeFileSync(path.join(runDir, "meta.json"), JSON.stringify(meta));

  const events: unknown[] = [
    { t: "2026-04-17T14:00:00.000Z", type: "run_started", data: { runId, rootInput: meta.rootInput } },
  ];
  for (const s of opts.stages ?? []) {
    const [, kind, issueId] = s.slug.match(/^\d+-(.+)-([A-Z]+-\d+)$/) ?? [];
    events.push({
      t: s.startedAt ?? "2026-04-17T14:01:00.000Z",
      type: "stage_started",
      data: { kind, issueId, stageDir: path.join(runDir, "stages", s.slug) },
    });
    if (s.result) {
      events.push({
        t: s.finishedAt ?? "2026-04-17T14:02:00.000Z",
        type: "stage_complete",
        data: { kind, issueId, status: s.result.status, costUsd: s.result.costUsd },
      });
    }
  }
  if (opts.status === "complete") events.push({ t: "2026-04-17T14:04:00.000Z", type: "pipeline_complete", data: {} });
  if (opts.status === "blocked") events.push({ t: "2026-04-17T14:04:00.000Z", type: "exit_blocked", data: {} });
  if (opts.status === "failed") events.push({ t: "2026-04-17T14:04:00.000Z", type: "exit_error", data: { message: "boom" } });

  writeFileSync(
    path.join(runDir, "events.ndjson"),
    events.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );

  for (const s of opts.stages ?? []) {
    const sDir = path.join(runDir, "stages", s.slug);
    mkdirSync(sDir, { recursive: true });
    writeFileSync(path.join(sDir, "prompt.md"), `# prompt for ${s.slug}`);
    if (s.result) writeFileSync(path.join(sDir, "result.json"), JSON.stringify(s.result));
    const tl = s.transcriptLines ?? 0;
    const transcript = Array.from({ length: tl }, (_, i) =>
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: `hi ${i}` }] } }),
    ).join("\n");
    writeFileSync(path.join(sDir, "transcript.jsonl"), transcript + (tl ? "\n" : ""));
    writeFileSync(path.join(sDir, "tool-calls.jsonl"), "");
    if (s.stderr) writeFileSync(path.join(sDir, "stderr.log"), s.stderr);
  }

  if (opts.blockers) writeFileSync(path.join(runDir, "blockers.json"), JSON.stringify(opts.blockers));
}

describe("listRuns", () => {
  it("returns empty when runs dir is empty", () => {
    expect(listRuns(runsDir)).toEqual([]);
  });

  it("summarises runs with correct status and sorts newest first", () => {
    scaffoldRun("20260417-100000-aaa", { rootInput: "ENG-1", status: "complete" });
    scaffoldRun("20260417-110000-bbb", { rootInput: "ENG-2", status: "running" });
    scaffoldRun("20260417-120000-ccc", { rootInput: "ENG-3", status: "blocked" });

    const runs = listRuns(runsDir);
    expect(runs.map((r) => r.runId)).toEqual([
      "20260417-120000-ccc",
      "20260417-110000-bbb",
      "20260417-100000-aaa",
    ]);
    expect(runs.map((r) => r.status)).toEqual(["blocked", "running", "done"]);
    expect(runs[0]!.rootInput).toBe("ENG-3");
  });

  it("reports stageKinds and stageCount from disk", () => {
    scaffoldRun("20260417-130000-ddd", {
      rootInput: "ENG-4",
      status: "complete",
      stages: [
        { slug: "0001-ba-ENG-4", result: { status: "done", summary: "ok", costUsd: 0.5 } },
        { slug: "0002-po-ENG-4", result: { status: "done", summary: "ok", costUsd: 0.1 } },
      ],
    });
    const [run] = listRuns(runsDir);
    expect(run.stageCount).toBe(2);
    expect(run.stageKinds).toEqual(["ba", "po"]);
  });
});

describe("readRun", () => {
  it("returns null for missing run", () => {
    expect(readRun(runsDir, "no-such")).toBeNull();
  });

  it("hydrates stages with status and durations from events", () => {
    scaffoldRun("20260417-140000-eee", {
      rootInput: "ENG-5",
      status: "complete",
      stages: [
        {
          slug: "0001-ba-ENG-5",
          result: { status: "done", summary: "analysed", costUsd: 1.5 },
          transcriptLines: 12,
          startedAt: "2026-04-17T14:01:00.000Z",
          finishedAt: "2026-04-17T14:03:30.000Z",
        },
      ],
    });
    const detail = readRun(runsDir, "20260417-140000-eee");
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe("done");
    expect(detail!.stages).toHaveLength(1);
    const stage = detail!.stages[0]!;
    expect(stage.kind).toBe("ba");
    expect(stage.issueId).toBe("ENG-5");
    expect(stage.status).toBe("done");
    expect(stage.summary).toBe("analysed");
    expect(stage.transcriptLineCount).toBe(12);
    expect(stage.durationMs).toBe(150_000);
  });

  it("exposes blockers array when present", () => {
    scaffoldRun("20260417-150000-fff", {
      status: "blocked",
      blockers: [
        { issueId: "ENG-1", title: "x", description: "answer on linear", issueUrl: "https://..." },
      ],
    });
    const detail = readRun(runsDir, "20260417-150000-fff");
    expect(detail!.blockers).toHaveLength(1);
  });
});

describe("readStage", () => {
  it("returns null when stage dir missing", () => {
    scaffoldRun("20260417-160000-ggg", { status: "complete" });
    expect(readStage(runsDir, "20260417-160000-ggg", "0001-ba-MISSING")).toBeNull();
  });

  it("reads prompt, result, transcript and counts correctly", () => {
    scaffoldRun("20260417-170000-hhh", {
      status: "complete",
      stages: [
        {
          slug: "0001-ba-ENG-7",
          result: { status: "done", summary: "ok", costUsd: 2 },
          transcriptLines: 5,
          stderr: "oops",
        },
      ],
    });
    const detail = readStage(runsDir, "20260417-170000-hhh", "0001-ba-ENG-7");
    expect(detail).not.toBeNull();
    expect(detail!.kind).toBe("ba");
    expect(detail!.issueId).toBe("ENG-7");
    expect(detail!.status).toBe("done");
    expect(detail!.prompt).toContain("prompt for 0001-ba-ENG-7");
    expect(detail!.result!.status).toBe("done");
    expect(detail!.transcript).toHaveLength(5);
    expect(detail!.transcriptTotalLines).toBe(5);
    expect(detail!.transcriptTruncated).toBe(false);
    expect(detail!.stderr).toBe("oops");
  });

  it("truncates transcript to the limit and reports total", () => {
    scaffoldRun("20260417-180000-iii", {
      status: "running",
      stages: [
        {
          slug: "0001-ba-ENG-8",
          result: { status: "done", costUsd: 1 },
          transcriptLines: 1000,
        },
      ],
    });
    const detail = readStage(runsDir, "20260417-180000-iii", "0001-ba-ENG-8", { transcriptLimit: 50 });
    expect(detail!.transcript).toHaveLength(50);
    expect(detail!.transcriptTotalLines).toBe(1000);
    expect(detail!.transcriptTruncated).toBe(true);
  });
});
