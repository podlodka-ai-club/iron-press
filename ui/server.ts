#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRuns, readRun, readStage } from "./artifacts.js";
import { tailFile } from "./tail.js";
import { listJsonWorkflows, readWorkflow, workflowExists, writeWorkflow } from "./workflow-io.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.join(__dirname, "client");
const studioDistDir = path.join(__dirname, "studio", "dist");

// Resolve runs dir via the orchestrator's config so we stay in lockstep.
const orchestratorRoot = path.resolve(__dirname, "..");
const WORKFLOWS_DIR = path.join(orchestratorRoot, "src", "workflows");
const RUNS_DIR = process.env.ORCH_RUNS_DIR ?? path.join(orchestratorRoot, ".runs");

const ARGS = process.argv.slice(2);
const PORT = pickPort();
const SHOULD_OPEN = ARGS.includes("--open");

function pickPort(): number {
  const flag = ARGS.find((a) => a.startsWith("--port"));
  if (flag) {
    const eq = flag.includes("=") ? Number(flag.split("=")[1]) : Number(ARGS[ARGS.indexOf(flag) + 1]);
    if (Number.isFinite(eq) && eq > 0) return eq;
  }
  const envPort = Number(process.env.ORCH_UI_PORT ?? "");
  if (Number.isFinite(envPort) && envPort > 0) return envPort;
  return 4455;
}

// =============================================================================
// Router
// =============================================================================

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const { pathname } = url;

    // Static
    if (req.method === "GET" && pathname.startsWith("/static/")) {
      const rel = pathname.replace(/^\/static\//, "");
      const target = path.join(clientDir, rel);
      if (!target.startsWith(clientDir)) return send(res, 400, "bad path");
      return sendFile(res, target);
    }

    // API: runs list
    if (req.method === "GET" && pathname === "/api/runs") {
      return sendJson(res, 200, listRuns(RUNS_DIR));
    }

    // API: run detail
    let m = pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const detail = readRun(RUNS_DIR, m[1]!);
      if (!detail) return sendJson(res, 404, { error: `run not found: ${m[1]}` });
      return sendJson(res, 200, detail);
    }

    // API: run events SSE
    m = pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (req.method === "GET" && m) {
      return streamRunEvents(req, res, m[1]!);
    }

    // API: stage detail
    m = pathname.match(/^\/api\/runs\/([^/]+)\/stages\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const limit = Number(url.searchParams.get("transcriptLimit") ?? "500");
      const detail = readStage(RUNS_DIR, m[1]!, m[2]!, { transcriptLimit: limit });
      if (!detail) return sendJson(res, 404, { error: `stage not found: ${m[2]}` });
      return sendJson(res, 200, detail);
    }

    // API: stage stream SSE
    m = pathname.match(/^\/api\/runs\/([^/]+)\/stages\/([^/]+)\/stream$/);
    if (req.method === "GET" && m) {
      return streamStage(req, res, m[1]!, m[2]!);
    }

    // ==========================================================================
    // Studio static files — served before the monitoring SPA fallback
    // ==========================================================================
    if (req.method === "GET" && (pathname === "/studio" || pathname.startsWith("/studio/"))) {
      const rel = pathname === "/studio" ? "index.html" : pathname.slice("/studio/".length);
      const target = path.join(studioDistDir, rel);
      // Protect against path traversal
      if (!target.startsWith(studioDistDir)) return send(res, 400, "bad path");
      if (existsSync(target) && statSync(target).isFile()) return sendFile(res, target);
      // SPA fallback for client-side routing
      return sendFile(res, path.join(studioDistDir, "index.html"), "text/html; charset=utf-8");
    }

    // ==========================================================================
    // Studio API — /api/studio/*
    // ==========================================================================

    // GET /api/studio/agent-types
    if (req.method === "GET" && pathname === "/api/studio/agent-types") {
      return sendJson(res, 200, { agentTypes: AGENT_TYPES });
    }

    // GET /api/studio/workflows
    if (req.method === "GET" && pathname === "/api/studio/workflows") {
      const summaries = listJsonWorkflows(WORKFLOWS_DIR);
      const bundles = summaries
        .map((s) => readWorkflow(WORKFLOWS_DIR, s.name))
        .filter((b) => b !== null);
      return sendJson(res, 200, { workflows: bundles });
    }

    // GET /api/studio/workflows/:name
    m = pathname.match(/^\/api\/studio\/workflows\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const bundle = readWorkflow(WORKFLOWS_DIR, m[1]!);
      if (!bundle) return sendJson(res, 404, { error: `workflow not found: ${m[1]}` });
      return sendJson(res, 200, bundle);
    }

    // POST /api/studio/workflows — create new
    if (req.method === "POST" && pathname === "/api/studio/workflows") {
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "invalid JSON body" });
      }
      const bundle = body as { name?: string; definition?: unknown; skills?: unknown };
      if (!bundle.name || typeof bundle.name !== "string") {
        return sendJson(res, 400, { error: "missing name" });
      }
      if (workflowExists(WORKFLOWS_DIR, bundle.name)) {
        return sendJson(res, 409, { error: `workflow already exists: ${bundle.name}` });
      }
      try {
        writeWorkflow(WORKFLOWS_DIR, {
          name: bundle.name,
          definition: bundle.definition as never,
          skills: (bundle.skills ?? {}) as Record<string, string>,
        });
      } catch (err) {
        return sendJson(res, 422, { error: err instanceof Error ? err.message : String(err) });
      }
      return sendJson(res, 201, { name: bundle.name });
    }

    // PUT /api/studio/workflows/:name — update existing
    m = pathname.match(/^\/api\/studio\/workflows\/([^/]+)$/);
    if (req.method === "PUT" && m) {
      const name = m[1]!;
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "invalid JSON body" });
      }
      const bundle = body as { definition?: unknown; skills?: unknown };
      try {
        writeWorkflow(WORKFLOWS_DIR, {
          name,
          definition: bundle.definition as never,
          skills: (bundle.skills ?? {}) as Record<string, string>,
        });
      } catch (err) {
        return sendJson(res, 422, { error: err instanceof Error ? err.message : String(err) });
      }
      return sendJson(res, 200, { name });
    }

    // Anything else that's a plain GET falls back to the SPA shell so deep
    // links (/runs/<id>, /runs/<id>?stage=…) survive refresh. API routes above
    // already short-circuited, and /static/* is served explicitly.
    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      return sendFile(res, path.join(clientDir, "index.html"), "text/html; charset=utf-8");
    }

    send(res, 404, "not found");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(res, 500, message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  // eslint-disable-next-line no-console
  console.log(`orchestrator UI listening on ${url}  (runs: ${RUNS_DIR})`);
  if (SHOULD_OPEN) void openBrowser(url);
});

// =============================================================================
// SSE handlers
// =============================================================================

function streamRunEvents(_req: IncomingMessage, res: ServerResponse, runId: string): void {
  const runDir = path.join(RUNS_DIR, runId);
  if (!existsSync(runDir)) return sendJson(res, 404, { error: `run not found: ${runId}` });

  openSSE(res);

  const eventsFile = path.join(runDir, "events.ndjson");
  const unsubscribe = tailFile(eventsFile, (lines) => {
    for (const line of lines) {
      let parsed: unknown = line;
      try {
        parsed = JSON.parse(line);
      } catch {
        /* send raw if malformed */
      }
      writeSSE(res, "event", parsed);
    }
  });

  // Also watch for the appearance of new stage directories by re-scanning on a
  // coarse interval. Cheap, and keeps the frontend stage list fresh.
  const stageScan = setInterval(() => {
    try {
      const detail = readRun(RUNS_DIR, runId);
      if (detail) writeSSE(res, "snapshot", { stages: detail.stages, status: detail.status });
    } catch {
      /* ignore */
    }
  }, 1500);

  const keepalive = setInterval(() => writeSSE(res, "ping", { t: Date.now() }), 15_000);

  res.on("close", () => {
    unsubscribe();
    clearInterval(stageScan);
    clearInterval(keepalive);
  });
}

function streamStage(_req: IncomingMessage, res: ServerResponse, runId: string, slug: string): void {
  const stageDir = path.join(RUNS_DIR, runId, "stages", slug);
  if (!existsSync(stageDir)) return sendJson(res, 404, { error: `stage not found: ${slug}` });

  openSSE(res);

  const transcriptFile = path.join(stageDir, "transcript.jsonl");
  const toolCallsFile = path.join(stageDir, "tool-calls.jsonl");
  const resultFile = path.join(stageDir, "result.json");

  const unTranscript = tailFile(transcriptFile, (lines) => {
    for (const line of lines) {
      let parsed: unknown = line;
      try {
        parsed = JSON.parse(line);
      } catch {
        /* skip */
        continue;
      }
      writeSSE(res, "transcript", parsed);
    }
  });
  const unToolCalls = tailFile(toolCallsFile, (lines) => {
    for (const line of lines) {
      let parsed: unknown = line;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      writeSSE(res, "toolcall", parsed);
    }
  });

  // Poll for result.json appearance (only once)
  let resultEmitted = false;
  const resultPoll = setInterval(() => {
    if (resultEmitted) return;
    if (!existsSync(resultFile)) return;
    try {
      const raw = JSON.parse(readFileSync(resultFile, "utf8"));
      writeSSE(res, "result", raw);
      resultEmitted = true;
    } catch {
      /* retry on next tick */
    }
  }, 1000);

  const keepalive = setInterval(() => writeSSE(res, "ping", { t: Date.now() }), 15_000);

  res.on("close", () => {
    unTranscript();
    unToolCalls();
    clearInterval(resultPoll);
    clearInterval(keepalive);
  });
}

// =============================================================================
// HTTP helpers
// =============================================================================

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function sendFile(res: ServerResponse, file: string, fallbackType?: string): void {
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, "not found");
  const ext = path.extname(file).toLowerCase();
  const type =
    fallbackType ??
    {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".mjs": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    }[ext] ??
    "application/octet-stream";

  const cache = file.includes("/static/") ? "public, max-age=3600, immutable" : "no-store";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
  createReadStream(file).pipe(res);
}

function openSSE(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
}

function writeSSE(res: ServerResponse, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected — ignore
  }
}

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
}

// =============================================================================
// Body parsing
// =============================================================================

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const buf = await readBody(req);
  return JSON.parse(buf.toString("utf8")) as unknown;
}

// =============================================================================
// Agent type catalogue (used by GET /api/studio/agent-types)
// =============================================================================

function readSkill(nodeId: string): string {
  const p = path.join(WORKFLOWS_DIR, "simple", "nodes", nodeId, "skill.md");
  if (!existsSync(p)) return "";
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

// Tool lists mirror src/workflows/simple/nodes/{ba,eng}/permissions.ts — keep in sync.
const AGENT_TYPES = [
  {
    role: "business-analyst",
    label: "Business Analyst",
    color: "yellow",
    defaultNodeId: "ba",
    defaultSkill: readSkill("ba"),
    defaultConfig: {
      model: "claude-haiku-4-5",
      maxTurns: 60,
      budgetUsd: 4,
      allowedTools: ["Read", "Grep", "Glob", "WebFetch", "mcp__linear__*", "mcp__plugin_figma_figma__*"],
      disallowedTools: ["Edit", "Write", "Bash", "NotebookEdit"],
      permissionProfile: "view-only",
    },
  },
  {
    role: "engineer",
    label: "Engineer",
    color: "orange",
    defaultNodeId: "eng",
    defaultSkill: readSkill("eng"),
    defaultConfig: {
      model: "claude-haiku-4-5",
      maxTurns: 150,
      budgetUsd: 12,
      allowedTools: ["Read", "Grep", "Glob", "WebFetch", "Edit", "Write", "Bash", "mcp__linear__*"],
      disallowedTools: [],
      permissionProfile: "safe-write",
    },
  },

  {
    role: "human",
    label: "Human",
    color: "red",
    defaultNodeId: "human",
    defaultSkill: "Please answer the question.",
    defaultConfig: {
      model: "human",
      maxTurns: 1,
      budgetUsd: 0.1,
      allowedTools: [],
      disallowedTools: [],
      permissionProfile: "view-only",
    },
  },
  {
    role: "worktree-script",
    label: "Worktree Script",
    color: "purple",
    defaultNodeId: "worktree",
    defaultSkill: "",
    defaultConfig: {
      model: "script",
      maxTurns: 1,
      budgetUsd: 0.1,
      allowedTools: [],
      disallowedTools: [],
      permissionProfile: "safe-write",
    },
  },
];
