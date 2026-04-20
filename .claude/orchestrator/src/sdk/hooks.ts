import { appendFileSync } from "node:fs";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

/**
 * Append every pre/post tool-use event to a JSONL file for later analysis.
 */
export function logToolHook(filePath: string, when: "pre" | "post"): HookCallback {
  return async (input) => {
    try {
      const entry = {
        t: new Date().toISOString(),
        when,
        event: (input as Record<string, unknown>).hook_event_name,
        toolName: (input as Record<string, unknown>).tool_name,
        toolInput: (input as Record<string, unknown>).tool_input,
        toolResponse: (input as Record<string, unknown>).tool_response,
      };
      appendFileSync(filePath, JSON.stringify(entry) + "\n");
    } catch {
      // Never let logging failures break the stage
    }
    return { continue: true };
  };
}
