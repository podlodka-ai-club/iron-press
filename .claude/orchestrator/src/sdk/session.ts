import { appendFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";
import { logger } from "../util/logger.js";
import { extractLastFencedJson } from "../util/extract-json.js";
import {
  StageResultSchema,
  type StageResult,
  type WorkUnit,
} from "../types/contracts.js";
import {
  allowedToolsFor,
  disallowedToolsFor,
  makePermissionGuard,
  type StageRole,
} from "./permissions.js";
import { logToolHook } from "./hooks.js";
import type { StageDir } from "../runs/run-log.js";

// =============================================================================
// Stage spec (input to runStage)
// =============================================================================

export interface StageSpec {
  role: StageRole;
  sessionId: string;
  model: string;
  maxTurns: number;
  budgetUsd: number;
  systemAppend: string;
  userPrompt: string;
  dir: StageDir;
  workUnit?: WorkUnit; // only for dev role
  cwd?: string;
  abort?: AbortController;
  extraMcpServers?: Record<string, Options["mcpServers"] extends Record<string, infer V> ? V : never>;
}

// =============================================================================
// runStage
// =============================================================================

export async function runStage(spec: StageSpec): Promise<StageResult> {
  writeFileSync(spec.dir.promptPath, `# Prompt (role=${spec.role}, session=${spec.sessionId})\n\n${spec.userPrompt}`);

  const controller = spec.abort ?? new AbortController();

  const q = query({
    prompt: spec.userPrompt,
    options: {
      cwd: spec.cwd ?? config.workspaceRoot,
      model: spec.model,
      sessionId: spec.sessionId,
      maxTurns: spec.maxTurns,
      maxBudgetUsd: spec.budgetUsd,
      // Load user + project + local settings so we pick up:
      //   - user OAuth tokens for claude.ai connectors (Linear, Figma, Sentry, …)
      //   - enabled plugins from ~/.claude/settings.json
      //   - project-level allow/deny lists and plugin overrides from .claude/settings.json
      //   - local personal overrides from .claude/settings.local.json
      settingSources: ["user", "project", "local"],
      // MCPs (Linear, Figma, Sentry, etc.) are loaded from the plugin system via the
      // settingSources above. We only add extra per-stage MCPs when a caller needs them.
      ...(spec.extraMcpServers ? { mcpServers: spec.extraMcpServers } : {}),
      systemPrompt: { type: "preset", preset: "claude_code", append: spec.systemAppend },
      allowedTools: allowedToolsFor(spec.role),
      disallowedTools: disallowedToolsFor(spec.role),
      permissionMode: "bypassPermissions",
      canUseTool: makePermissionGuard({ role: spec.role, workUnit: spec.workUnit }),
      hooks: {
        PreToolUse: [{ hooks: [logToolHook(spec.dir.toolCallsPath, "pre")] }],
        PostToolUse: [{ hooks: [logToolHook(spec.dir.toolCallsPath, "post")] }],
      },
      stderr: (line) => {
        try {
          appendFileSync(spec.dir.stderrPath, line + "\n");
        } catch {}
      },
      abortController: controller,
      env: process.env as Record<string, string>,
    } satisfies Options,
  });

  let finalText = "";
  let resultMsg: Record<string, unknown> | null = null;

  try {
    for await (const msg of q as AsyncIterable<Record<string, unknown>>) {
      appendFileSync(spec.dir.transcriptPath, JSON.stringify(msg) + "\n");

      if (msg.type === "assistant") {
        const content = ((msg.message as Record<string, unknown>) ?? {}).content as unknown;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              block &&
              typeof block === "object" &&
              (block as Record<string, unknown>).type === "text"
            ) {
              finalText += (block as { text: string }).text + "\n";
            }
          }
        }
      }
      if (msg.type === "result") {
        resultMsg = msg;
      }
    }
  } catch (err) {
    logger.error({ err, role: spec.role, sessionId: spec.sessionId }, "SDK session threw");
    return failedResult(spec, err);
  }

  const fenced = extractLastFencedJson(finalText);
  if (!fenced) {
    return failedResult(spec, new Error("stage did not emit a fenced ```json result block"));
  }

  let parsed: StageResult;
  try {
    const raw = JSON.parse(fenced);
    const res = StageResultSchema.safeParse(raw);
    if (!res.success) {
      return failedResult(spec, new Error(`stage result failed schema: ${res.error.message}`));
    }
    parsed = res.data;
  } catch (err) {
    return failedResult(spec, err);
  }

  // Enrich with session metrics
  const costUsd = Number((resultMsg?.total_cost_usd ?? parsed.costUsd) ?? 0);
  const usage = (resultMsg?.usage ?? {}) as Record<string, number | undefined>;
  const enriched: StageResult = {
    ...parsed,
    sessionId: spec.sessionId,
    transcriptPath: spec.dir.transcriptPath,
    costUsd,
    tokens: {
      input: Number(usage.input_tokens ?? parsed.tokens.input ?? 0),
      output: Number(usage.output_tokens ?? parsed.tokens.output ?? 0),
      cacheRead: Number(usage.cache_read_input_tokens ?? parsed.tokens.cacheRead ?? 0),
      cacheCreation: Number(usage.cache_creation_input_tokens ?? parsed.tokens.cacheCreation ?? 0),
    },
  };

  writeFileSync(spec.dir.resultPath, JSON.stringify(enriched, null, 2));
  return enriched;
}

function failedResult(spec: StageSpec, err: unknown): StageResult {
  const message = err instanceof Error ? err.message : String(err);
  const stub: StageResult = {
    status: "failed",
    issueIdsCreated: [],
    issueIdsUpdated: [],
    questionsPosted: false,
    blockers: [],
    summary: `Stage failed: ${message}`,
    costUsd: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    sessionId: spec.sessionId,
    transcriptPath: spec.dir.transcriptPath,
    errorMessage: message,
  };
  try {
    writeFileSync(spec.dir.resultPath, JSON.stringify(stub, null, 2));
  } catch {}
  return stub;
}

// =============================================================================
// Pre-flight — confirm the Linear plugin is actually available in the SDK
// session for the current cwd. We run a minimal `query()` that lists MCP
// servers via the init message and fail fast if the plugin is missing or
// not authenticated. This saves an expensive LLM turn per stage when the
// plugin isn't wired up.
// =============================================================================

export interface McpHealthCheck {
  linearAvailable: boolean;
  linearStatus: string;
  availableServers: Array<{ name: string; status: string }>;
}

export async function checkMcpHealth(cwd: string): Promise<McpHealthCheck> {
  const controller = new AbortController();
  const q = query({
    prompt: "exit",
    options: {
      cwd,
      settingSources: ["user", "project", "local"],
      permissionMode: "bypassPermissions",
      maxTurns: 1,
      abortController: controller,
    } satisfies Options,
  });
  let servers: Array<{ name: string; status: string }> = [];
  try {
    for await (const m of q as AsyncIterable<Record<string, unknown>>) {
      if (m.type === "system" && m.subtype === "init") {
        servers = ((m.mcp_servers ?? []) as Array<{ name: string; status: string }>) || [];
        controller.abort();
        break;
      }
    }
  } catch {
    // abort throws — ignore
  }
  // Accept either the project-level `.mcp.json` server name (`linear`) or the
  // plugin-prefixed name (`plugin:linear:linear`) if you switch back to the plugin.
  const linear =
    servers.find((s) => s.name === "linear") ??
    servers.find((s) => s.name === "plugin:linear:linear");
  return {
    linearAvailable: Boolean(linear) && linear!.status === "connected",
    linearStatus: linear?.status ?? "missing",
    availableServers: servers,
  };
}

// =============================================================================
// Session id helpers — stable UUIDv5 per (run, role, issue) so resume works.
// The SDK validates that sessionId is a UUID; a deterministic UUIDv5 gives us
// both properties (valid + reproducible).
// =============================================================================

// Fixed namespace UUID for the orchestrator (randomly chosen once).
const ORCH_NAMESPACE = "6b7ae4e2-7a91-4cf1-9a1d-4ab3e2a1c000";

/**
 * Build a unique session id per stage dispatch.
 *
 * The SDK refuses to reuse a session id, and the same (role, issueId) may be
 * dispatched multiple times within one run (e.g. PO across iterations). We mix
 * the stage index into the hash so every dispatch gets its own UUID while
 * remaining deterministic per stage slot (so `--resume` can re-derive ids).
 */
export function stableSessionId(
  role: string,
  issueId: string,
  runId: string,
  stageIndex?: number,
): string {
  const suffix = stageIndex === undefined ? "" : `::${stageIndex}`;
  return uuidV5(`${runId}::${role}::${issueId}${suffix}`.toLowerCase(), ORCH_NAMESPACE);
}

function uuidV5(name: string, namespace: string): string {
  const nsBytes = parseUuid(namespace);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1").update(Buffer.concat([nsBytes, nameBytes])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // Set version (5) and variant (RFC 4122)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}
