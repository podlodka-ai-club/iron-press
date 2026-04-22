import { AgentNode, type AgentNodeConfig } from "@/sdk/node";
import { loadSkill } from "@/util/skill-loader";
import type { RunLog } from "@/runs/run-log";
import { allowedTools, disallowedTools, canUseTool } from "./permissions.js";

// ---------------------------------------------------------------------------
// Local node config — kept inside the node folder; no global config file.
// ---------------------------------------------------------------------------

const PROMPT = loadSkill(import.meta.url, "skill.md");

const CONFIG: AgentNodeConfig = {
  id: "ba",
  name: "Business Analyst",
  role: "business-analyst",
  prompt: PROMPT,
  model: "claude-haiku-4-5",
  maxTurns: 60,
  budgetUsd: 4,
  allowedTools,
  disallowedTools,
  canUseTool,
};

/**
 * BA node for the `simple` workflow. Analyzes a single Linear issue and
 * either hands off to Eng (Pass) or blocks on human input (WaitUserInput).
 * The user prompt is rendered from `skill.md` by `AgentNode._buildUserPrompt`.
 */
export class BaNode<TState extends { issueId: string; runId: string }>
  extends AgentNode<TState>
{
  constructor(runLog: RunLog, cwd: string) {
    super(CONFIG, runLog, cwd);
  }
}
