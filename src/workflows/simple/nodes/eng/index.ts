import { AgentNode, type AgentNodeConfig } from "@/sdk/node";
import { loadSkill } from "@/util/skill-loader";
import type { RunLog } from "@/runs/run-log";
import { allowedTools, disallowedTools, canUseTool } from "./permissions.js";

// ---------------------------------------------------------------------------
// Local node config — kept inside the node folder; no global config file.
// ---------------------------------------------------------------------------

const PROMPT = loadSkill(import.meta.url, "skill.md");

const CONFIG: AgentNodeConfig = {
  id: "eng",
  name: "Engineer",
  role: "engineer",
  prompt: PROMPT,
  model: "claude-haiku-4-5",
  maxTurns: 150,
  budgetUsd: 12,
  allowedTools,
  disallowedTools,
  canUseTool,
};

/**
 * Eng node for the `simple` workflow. Implements the issue's changes in the
 * current working directory. No branch creation, no PR (added later as a
 * separate script node). The user prompt is rendered from `skill.md` by
 * `AgentNode._buildUserPrompt`.
 */
export class EngNode<TState extends { issueId: string; runId: string }>
  extends AgentNode<TState>
{
  constructor(runLog: RunLog, cwd: string) {
    super(CONFIG, runLog, cwd);
  }
}
