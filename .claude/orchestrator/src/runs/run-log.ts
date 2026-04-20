import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, type WriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { Action, PipelineState, RunMeta, StageResult, TokenUsage } from "../types/contracts.js";
import { logger } from "../util/logger.js";

export interface StageDir {
  index: number;
  role: string;
  issueId: string;
  dir: string;
  transcriptPath: string;
  resultPath: string;
  promptPath: string;
  stderrPath: string;
  toolCallsPath: string;
}

export interface StageDescriptor {
  kind: string;
  issueId: string;
}

export interface RunLog {
  runId: string;
  runDir: string;
  openStage(descriptor: StageDescriptor | Action): StageDir;
  appendEvent(type: string, data: unknown): void;
  writeState(state: PipelineState): void;
  writeMeta(meta: RunMeta): void;
  readMeta(): RunMeta | null;
  close(): void;
}

export function createRunLog(opts: {
  runId?: string;
  rootInput: string;
  flags: unknown;
  resume?: boolean;
}): RunLog {
  const runId = opts.runId ?? shortId();
  const runDir = path.join(config.runsDir, runId);
  mkdirSync(runDir, { recursive: true });
  mkdirSync(path.join(runDir, "stages"), { recursive: true });

  const eventsStream: WriteStream = createWriteStream(path.join(runDir, "events.ndjson"), {
    flags: "a",
  });

  let stageCounter = computeStageCounter(runDir);

  function openStage(descriptor: StageDescriptor | Action): StageDir {
    stageCounter += 1;
    const index = stageCounter;
    const slug = `${String(index).padStart(4, "0")}-${descriptor.kind}-${descriptor.issueId}`;
    const dir = path.join(runDir, "stages", slug);
    mkdirSync(dir, { recursive: true });
    return {
      index,
      role: descriptor.kind,
      issueId: descriptor.issueId,
      dir,
      transcriptPath: path.join(dir, "transcript.jsonl"),
      resultPath: path.join(dir, "result.json"),
      promptPath: path.join(dir, "prompt.md"),
      stderrPath: path.join(dir, "stderr.log"),
      toolCallsPath: path.join(dir, "tool-calls.jsonl"),
    };
  }

  function appendEvent(type: string, data: unknown): void {
    const entry = { t: new Date().toISOString(), type, data };
    eventsStream.write(JSON.stringify(entry) + "\n");
  }

  function writeState(state: PipelineState): void {
    writeFileSync(path.join(runDir, "state.json"), JSON.stringify(state, null, 2));
  }

  function writeMeta(meta: RunMeta): void {
    writeFileSync(path.join(runDir, "meta.json"), JSON.stringify(meta, null, 2));
  }

  function readMeta(): RunMeta | null {
    const p = path.join(runDir, "meta.json");
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as RunMeta;
    } catch (e) {
      logger.warn({ e }, "failed to parse run meta");
      return null;
    }
  }

  function close(): void {
    eventsStream.end();
  }

  appendEvent(opts.resume ? "run_resumed" : "run_started", {
    runId,
    rootInput: opts.rootInput,
    flags: opts.flags,
  });

  return {
    runId,
    runDir,
    openStage,
    appendEvent,
    writeState,
    writeMeta,
    readMeta,
    close,
  };
}

/**
 * Run id format: `YYYYMMDD-HHmmss-<rand>` (local time).
 * The leading timestamp makes `ls` sort newest-last and keeps folders grouped by day.
 */
function shortId(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = randomUUID().replace(/-/g, "").slice(0, 6);
  return `${stamp}-${rand}`;
}

function computeStageCounter(runDir: string): number {
  try {
    const stagesDir = path.join(runDir, "stages");
    if (!existsSync(stagesDir)) return 0;
    const entries = readFileSync(stagesDir, "utf8"); // will throw on dir — use fs.readdirSync
    return entries.length;
  } catch {
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      const dirs = fs.readdirSync(path.join(runDir, "stages"));
      let max = 0;
      for (const d of dirs) {
        const m = d.match(/^(\d+)-/);
        if (m && m[1]) max = Math.max(max, Number(m[1]));
      }
      return max;
    } catch {
      return 0;
    }
  }
}

// =============================================================================
// Cost aggregation
// =============================================================================

export function accumulateCost(acc: { usd: number; tokens: TokenUsage }, result: StageResult): void {
  acc.usd += result.costUsd;
  acc.tokens.input += result.tokens.input;
  acc.tokens.output += result.tokens.output;
  acc.tokens.cacheRead += result.tokens.cacheRead;
  acc.tokens.cacheCreation += result.tokens.cacheCreation;
}
