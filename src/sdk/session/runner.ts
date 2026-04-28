import { appendFileSync } from "node:fs";
import {
  query,
  type CanUseTool,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
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

function trunc(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

function fmtContent(items: Array<Record<string, unknown>>): string {
  return (
    items
      .map((item) => {
        if (item.type === "text")
          return `[Assistant] ${trunc(String(item.text ?? ""), 80)}`;
        if (item.type === "tool_use") {
          const input = item.input as Record<string, unknown> | undefined;
          const val =
            input &&
            Object.values(input).find((v) => typeof v === "string");
          return val
            ? `[Tool:${String(item.name ?? "?")}] "${trunc(String(val), 60)}"`
            : `[Tool:${String(item.name ?? "?")}]`;
        }
        if (item.type === "tool_result") {
          const raw = Array.isArray(item.content)
            ? (item.content as Array<Record<string, unknown>>)
                .map((c) => String(c.text ?? ""))
                .join(" ")
            : String(item.content ?? "");
          return `[Result] ${trunc(raw, 80)}`;
        }
        if (item.type === "thinking")
          return `[Thinking] ${trunc(String(item.thinking ?? ""), 60)}`;
        return `[${String(item.type)}]`;
      })
      .join(", ") || "(empty)"
  );
}

function fmtMsg(msg: Record<string, unknown>): string {
  const message = msg.message as
    | { content?: Array<Record<string, unknown>> | string }
    | undefined;
  const content = message?.content;
  if (typeof content === "string") return `[User] ${trunc(content, 80)}`;
  return fmtContent(Array.isArray(content) ? content : []);
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
      if (msg.type === "assistant" || msg.type === "user") {
        logger.info(
          { sessionId: cfg.sessionId, summary: fmtMsg(msg) },
          "msg",
        );
      } else if (msg.type === "result") {
        resultMsg = msg;
        logger.debug(
          {
            sessionId: cfg.sessionId,
            turns: msg.num_turns,
            ms: msg.duration_ms,
            usd: msg.total_cost_usd,
            status: (
              msg.structured_output as Record<string, unknown> | undefined
            )?.status,
          },
          "msg result",
        );
      }
    }
  } catch (err) {
    logger.error({ err, sessionId: cfg.sessionId }, "SDK session threw");
    return null;
  }
  return resultMsg;
}
