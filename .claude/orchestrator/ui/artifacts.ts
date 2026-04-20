import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { deriveRunStatus, deriveStageStatus, type RunStatus, type StageStatus } from "./status.js";

// =============================================================================
// Types
// =============================================================================

export interface RunSummary {
  runId: string;
  rootInput: string;
  rootTitle?: string; // Human-friendly issue title, pulled from state.json
  status: RunStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  stageCount: number;
  totalCostUsd: number;
  flags?: Record<string, unknown>;
  stageKinds: string[]; // for mini-chips on the runs index
  // For running runs: the most recent in-flight stage, so the card can show
  // a live indicator without a full detail fetch.
  currentStage?: {
    kind: string;
    issueId: string;
    issueTitle?: string;
    startedAt?: string;
  };
}

export interface StageSummary {
  index: number;
  slug: string;
  kind: string;
  issueId: string;
  issueTitle?: string; // Looked up from state.json when available
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  costUsd?: number;
  summary?: string;
  transcriptLineCount: number;
  toolCallCount: number;
  hasStderr: boolean;
  questionsPosted?: boolean;
  errorMessage?: string;
}

export interface EventRecord {
  t: string;
  type: string;
  data: unknown;
}

export interface RunDetail {
  runId: string;
  runDir: string;
  meta: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
  events: EventRecord[];
  stages: StageSummary[];
  blockers: unknown[] | null;
  status: RunStatus;
}

export interface StageDetail {
  slug: string;
  index: number;
  kind: string;
  issueId: string;
  status: StageStatus;
  prompt: string;
  result: Record<string, unknown> | null;
  transcript: unknown[];
  transcriptTruncated: boolean;
  transcriptTotalLines: number;
  toolCalls: unknown[];
  stderr: string;
}

// =============================================================================
// Helpers
// =============================================================================

function safeReadJson<T = unknown>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

function readNdjson(p: string, maxLines = Number.POSITIVE_INFINITY): { rows: unknown[]; total: number } {
  if (!existsSync(p)) return { rows: [], total: 0 };
  const raw = readFileSync(p, "utf8");
  const allLines = raw.split("\n").filter((l) => l.length > 0);
  const total = allLines.length;
  const slice = maxLines >= total ? allLines : allLines.slice(total - maxLines);
  const rows: unknown[] = [];
  for (const line of slice) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // ignore malformed line
    }
  }
  return { rows, total };
}

function countLines(p: string): number {
  if (!existsSync(p)) return 0;
  const raw = readFileSync(p, "utf8");
  return raw.length === 0 ? 0 : raw.split("\n").filter((l) => l.length > 0).length;
}

function parseSlug(slug: string): { index: number; kind: string; issueId: string } {
  // e.g. "0003-ba-check-comments-ENG-938"
  const match = slug.match(/^(\d+)-(.+?)-([A-Z]+-\d+)$/);
  if (!match) return { index: 0, kind: slug, issueId: "" };
  return { index: Number(match[1]), kind: match[2] ?? "", issueId: match[3] ?? "" };
}

// =============================================================================
// Readers
// =============================================================================

export function listRuns(runsDir: string): RunSummary[] {
  if (!existsSync(runsDir)) return [];
  const entries = readdirSync(runsDir, { withFileTypes: true });
  const runs: RunSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const summary = summariseRun(runsDir, entry.name);
      if (summary) runs.push(summary);
    } catch {
      // Skip malformed run dirs
    }
  }
  // Sort newest first — prefer meta.startedAt (authoritative); fall back to runId
  // (new-style runIds start with a timestamp, old-style are random hex).
  runs.sort((a, b) => {
    const ta = a.startedAt ? Date.parse(a.startedAt) : 0;
    const tb = b.startedAt ? Date.parse(b.startedAt) : 0;
    if (ta !== tb) return tb - ta;
    return b.runId.localeCompare(a.runId);
  });
  return runs;
}

function summariseRun(runsDir: string, runId: string): RunSummary | null {
  const runDir = path.join(runsDir, runId);
  const meta = safeReadJson<{
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number;
    rootInput?: string;
    totalCostUsd?: number;
    stageCount?: number;
    flags?: Record<string, unknown>;
  }>(path.join(runDir, "meta.json"));

  const eventsFile = path.join(runDir, "events.ndjson");
  const eventTypes = readEventTypes(eventsFile);

  // Enumerate stages on disk (trust fs over meta.stageCount)
  const stagesDir = path.join(runDir, "stages");
  let stageSlugs: string[] = [];
  try {
    stageSlugs = existsSync(stagesDir)
      ? readdirSync(stagesDir).filter((d) => /^\d{4}-/.test(d))
      : [];
  } catch {
    stageSlugs = [];
  }
  stageSlugs.sort();

  const stageKinds = stageSlugs.map((slug) => parseSlug(slug).kind).filter(Boolean);

  // Lookup issue title → state.json keeps a snapshot of the walked Linear tree
  const titleLookup = readIssueTitleLookup(runDir);
  const rootTitle = meta?.rootInput ? titleLookup[meta.rootInput] : undefined;

  const startedAt = meta?.startedAt;
  const finishedAt = meta?.finishedAt;
  const durationMs =
    startedAt && finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : undefined;

  const status = deriveRunStatus(meta ?? null, eventTypes);

  // For running runs, find the most recent stage without a result.json → that's
  // the in-flight one. Scan from the end for speed.
  let currentStage: RunSummary["currentStage"] | undefined;
  if (status === "running") {
    for (let i = stageSlugs.length - 1; i >= 0; i--) {
      const slug = stageSlugs[i]!;
      const resultPath = path.join(stagesDir, slug, "result.json");
      if (!existsSync(resultPath)) {
        const parsed = parseSlug(slug);
        currentStage = {
          kind: parsed.kind,
          issueId: parsed.issueId,
          issueTitle: titleLookup[parsed.issueId],
        };
        break;
      }
    }
  }

  return {
    runId,
    rootInput: meta?.rootInput ?? "(unknown)",
    rootTitle,
    status,
    startedAt,
    finishedAt,
    durationMs,
    stageCount: stageSlugs.length,
    totalCostUsd: meta?.totalCostUsd ?? 0,
    flags: meta?.flags ?? undefined,
    stageKinds,
    currentStage,
  };
}

/**
 * Build a { issueId → title } map from the latest state.json, if present.
 * Empty object on any failure — titles are a nice-to-have.
 */
function readIssueTitleLookup(runDir: string): Record<string, string> {
  const state = safeReadJson<{ issues?: Record<string, { id?: string; title?: string }> }>(
    path.join(runDir, "state.json"),
  );
  const issues = state?.issues;
  if (!issues) return {};
  const out: Record<string, string> = {};
  for (const [id, issue] of Object.entries(issues)) {
    const title = issue?.title;
    if (typeof title === "string" && title.length > 0) out[id] = title;
  }
  return out;
}

function readEventTypes(eventsFile: string): string[] {
  if (!existsSync(eventsFile)) return [];
  try {
    const raw = readFileSync(eventsFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const out: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { type?: string };
        if (parsed.type) out.push(parsed.type);
      } catch {
        // skip
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function readRun(runsDir: string, runId: string): RunDetail | null {
  const runDir = path.join(runsDir, runId);
  if (!existsSync(runDir)) return null;

  const meta = safeReadJson<Record<string, unknown>>(path.join(runDir, "meta.json"));
  const state = safeReadJson<Record<string, unknown>>(path.join(runDir, "state.json"));
  const { rows: eventRows } = readNdjson(path.join(runDir, "events.ndjson"));
  const events = eventRows as EventRecord[];
  const eventTypes = events.map((e) => e.type);
  const blockers = safeReadJson<unknown[]>(path.join(runDir, "blockers.json"));

  const stagesDir = path.join(runDir, "stages");
  const titleLookup = readIssueTitleLookup(runDir);
  let stages: StageSummary[] = [];
  if (existsSync(stagesDir)) {
    const stageSlugs = readdirSync(stagesDir)
      .filter((d) => /^\d{4}-/.test(d))
      .sort();
    stages = stageSlugs
      .map((slug) => summariseStage(stagesDir, slug, events, titleLookup))
      .filter((s): s is StageSummary => s !== null);
  }

  return {
    runId,
    runDir,
    meta,
    state,
    events,
    stages,
    blockers,
    status: deriveRunStatus(
      (meta as { startedAt?: string; finishedAt?: string; exitCode?: number } | null) ?? null,
      eventTypes,
    ),
  };
}

function summariseStage(
  stagesDir: string,
  slug: string,
  runEvents: EventRecord[],
  titleLookup: Record<string, string>,
): StageSummary | null {
  const dir = path.join(stagesDir, slug);
  if (!statSync(dir).isDirectory()) return null;
  const { index, kind, issueId } = parseSlug(slug);

  const result = safeReadJson<{
    status?: "done" | "blocked" | "failed";
    summary?: string;
    costUsd?: number;
    questionsPosted?: boolean;
    errorMessage?: string;
  }>(path.join(dir, "result.json"));

  const transcriptPath = path.join(dir, "transcript.jsonl");
  const toolCallsPath = path.join(dir, "tool-calls.jsonl");
  const stderrPath = path.join(dir, "stderr.log");

  // Timestamps from events.ndjson: `stage_started` / `stage_complete`
  const startedEvent = runEvents.find(
    (e) => e.type === "stage_started" && matchesStage(e.data, kind, issueId, dir),
  );
  const completedEvent = runEvents.find(
    (e) => e.type === "stage_complete" && matchesStage(e.data, kind, issueId, dir),
  );
  const startedAt = startedEvent?.t;
  const finishedAt = completedEvent?.t;
  const durationMs =
    startedAt && finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : undefined;

  const stderrSize = existsSync(stderrPath) ? statSync(stderrPath).size : 0;

  return {
    index,
    slug,
    kind,
    issueId,
    issueTitle: titleLookup[issueId],
    status: deriveStageStatus(result),
    startedAt,
    finishedAt,
    durationMs,
    costUsd: result?.costUsd,
    summary: result?.summary,
    transcriptLineCount: countLines(transcriptPath),
    toolCallCount: countLines(toolCallsPath),
    hasStderr: stderrSize > 0,
    questionsPosted: result?.questionsPosted,
    errorMessage: result?.errorMessage,
  };
}

function matchesStage(data: unknown, kind: string, issueId: string, dir: string): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { kind?: string; issueId?: string; stageDir?: string };
  if (d.stageDir) return d.stageDir === dir;
  return d.kind === kind && d.issueId === issueId;
}

export function readStage(
  runsDir: string,
  runId: string,
  slug: string,
  opts: { transcriptLimit?: number } = {},
): StageDetail | null {
  const runDir = path.join(runsDir, runId);
  const stageDir = path.join(runDir, "stages", slug);
  if (!existsSync(stageDir)) return null;
  const { index, kind, issueId } = parseSlug(slug);
  const limit = opts.transcriptLimit ?? 500;

  const prompt = safeRead(path.join(stageDir, "prompt.md"));
  const result = safeReadJson<Record<string, unknown>>(path.join(stageDir, "result.json"));
  const { rows: transcript, total: transcriptTotalLines } = readNdjson(
    path.join(stageDir, "transcript.jsonl"),
    limit,
  );
  const { rows: toolCalls } = readNdjson(path.join(stageDir, "tool-calls.jsonl"));
  const stderr = safeRead(path.join(stageDir, "stderr.log"));

  return {
    slug,
    index,
    kind,
    issueId,
    status: deriveStageStatus(
      (result as { status?: "done" | "blocked" | "failed" } | null) ?? null,
    ),
    prompt,
    result,
    transcript,
    transcriptTruncated: transcriptTotalLines > transcript.length,
    transcriptTotalLines,
    toolCalls,
    stderr,
  };
}

function safeRead(p: string): string {
  if (!existsSync(p)) return "";
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}
