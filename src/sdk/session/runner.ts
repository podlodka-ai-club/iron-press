import { appendFileSync } from "node:fs";
import { query, type CanUseTool, type Options } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "@/util/logger";

type SdkHooks = NonNullable<Options["hooks"]>;

export interface SessionConfig {
  /** Working directory the SDK spawns its session in. */
  cwd: string;
  /** Deterministic session UUID (see `stableSessionId`). */
  sessionId: string;
  /** User prompt for this invocation. */
  prompt: string;
  model: string;
  maxTurns: number;
  budgetUsd: number;
  allowedTools: string[];
  disallowedTools: string[];
  canUseTool: CanUseTool;
  /** Optional JSON schema for structured output. */
  outputSchema?: Record<string, unknown>;
  /** Optional PreToolUse / PostToolUse hooks. */
  hooks?: SdkHooks;
  /** Path to append each SDK message as JSONL. */
  transcriptPath: string;
  /** Path to append SDK stderr lines. */
  stderrPath: string;
}

/**
 * Run one headless `@anthropic-ai/claude-agent-sdk` query, streaming transcript
 * and stderr to the caller-supplied paths. Returns the final `result` message
 * (or `null` if the SDK threw).
 *
 * Scope: this is the generic plumbing — callers own prompt shaping, permissions,
 * output parsing, and artifact semantics.
 */
export async function runSession(
  cfg: SessionConfig,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const options: Options = {
    cwd: cfg.cwd,
    model: cfg.model,
    sessionId: cfg.sessionId,
    maxTurns: cfg.maxTurns,
    maxBudgetUsd: cfg.budgetUsd,
    settingSources: ["user", "project", "local"],
    allowedTools: cfg.allowedTools,
    disallowedTools: cfg.disallowedTools,
    permissionMode: "bypassPermissions",
    canUseTool: cfg.canUseTool,
    stderr: (line) => {
      try {
        appendFileSync(cfg.stderrPath, line + "\n");
      } catch {}
    },
    abortController: controller,
    env: process.env as Record<string, string>,
  };
  if (cfg.outputSchema) {
    options.outputFormat = { type: "json_schema", schema: cfg.outputSchema };
  }
  if (cfg.hooks) {
    options.hooks = cfg.hooks;
  }

  const q = query({ prompt: cfg.prompt, options });

  let resultMsg: Record<string, unknown> | null = null;
  try {
    for await (const msg of q as AsyncIterable<Record<string, unknown>>) {
      appendFileSync(cfg.transcriptPath, JSON.stringify(msg) + "\n");
      if (msg.type === "result") resultMsg = msg;
    }
  } catch (err) {
    logger.error({ err, sessionId: cfg.sessionId }, "SDK session threw");
    return null;
  }
  return resultMsg;
}
