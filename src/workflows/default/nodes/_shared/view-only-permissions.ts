import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

const LINEAR_TOOLS = ["mcp__linear__*"];
const FIGMA_TOOLS = ["mcp__plugin_figma_figma__*"];
const RESEARCH_TOOLS = ["Read", "Grep", "Glob", "WebFetch"];

export const viewOnlyAllowedTools: string[] = [
  ...RESEARCH_TOOLS,
  ...LINEAR_TOOLS,
  ...FIGMA_TOOLS,
];

export const viewOnlyDisallowedTools: string[] = [
  "Edit",
  "Write",
  "Bash",
  "NotebookEdit",
];

export const viewOnlyCanUseTool: CanUseTool = async (toolName) => {
  if (toolName === "Edit" || toolName === "Write" || toolName === "NotebookEdit") {
    return { behavior: "deny", message: "view-only profile may not write files" };
  }
  if (toolName === "Bash") {
    return { behavior: "deny", message: "view-only profile may not run bash" };
  }
  if (process.env.ORCH_OVER_BUDGET === "1") {
    return { behavior: "deny", message: "global run budget exceeded" };
  }
  return { behavior: "allow" };
};
