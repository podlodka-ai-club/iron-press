import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

const LINEAR_TOOLS = ["mcp__linear__*"];
const RESEARCH_TOOLS = ["Read", "Grep", "Glob", "WebFetch"];

export const allowedTools: string[] = [
  ...RESEARCH_TOOLS,
  "Edit",
  "Write",
  "Bash",
  ...LINEAR_TOOLS,
];

export const disallowedTools: string[] = [];

const FORBIDDEN_PATH_PREFIXES = ["/etc", "/var", "/root", "/usr", "/boot"];

const DANGEROUS_BASH_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\//,
  /\bgit\s+push\s+.*--force\b/,
  /\bgit\s+push\s+.*-f\b/,
  /\bgit\s+reset\s+--hard\s+origin\//,
  /\b:\(\)\s*\{/, // fork bomb
  /\bmkfs\b/,
  /\bdd\s+if=.*of=\/dev\//,
];

export const canUseTool: CanUseTool = async (toolName, input) => {
  if (toolName === "Edit" || toolName === "Write" || toolName === "NotebookEdit") {
    const raw = input as Record<string, unknown>;
    const candidate = (raw.file_path ?? raw.path ?? raw.notebookPath) as
      | string
      | undefined;
    if (!candidate) return { behavior: "deny", message: "missing file path" };
    if (FORBIDDEN_PATH_PREFIXES.some((p) => candidate.startsWith(p))) {
      return { behavior: "deny", message: "forbidden path prefix" };
    }
  }
  if (toolName === "Bash") {
    const raw = input as Record<string, unknown>;
    const cmd = String(raw.command ?? "");
    for (const rx of DANGEROUS_BASH_PATTERNS) {
      if (rx.test(cmd)) {
        return { behavior: "deny", message: `blocked dangerous command: ${rx}` };
      }
    }
  }
  if (process.env.ORCH_OVER_BUDGET === "1") {
    return { behavior: "deny", message: "global run budget exceeded" };
  }
  return { behavior: "allow" };
};
