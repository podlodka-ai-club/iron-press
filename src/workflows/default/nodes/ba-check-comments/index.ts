import { AgentNode, type AgentNodeConfig } from "@/sdk/node";
import { loadSkill } from "@/util/skill-loader";
import type { RunLog } from "@/runs/run-log";
import { allowedTools, disallowedTools, canUseTool } from "./permissions.js";
import { passCheck } from "./pass-check.js";

const PROMPT = loadSkill(import.meta.url, "skill.md");

const CONFIG: AgentNodeConfig = {
  id: "ba-check-comments",
  name: "Business Analyst — Check Comments",
  role: "business-analyst-check-comments",
  prompt: PROMPT,
  model: "claude-haiku-4-5",
  maxTurns: 40,
  budgetUsd: 3,
  allowedTools,
  disallowedTools,
  canUseTool,
  passCheck,
};

export class BaCheckCommentsNode<TState extends { issueId: string; runId: string }>
  extends AgentNode<TState>
{
  constructor(runLog: RunLog, cwd: string) {
    super(CONFIG, runLog, cwd);
  }
}
