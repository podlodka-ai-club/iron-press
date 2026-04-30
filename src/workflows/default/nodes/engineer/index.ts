import { AgentNode, type AgentNodeConfig } from "@/sdk/node";
import { loadSkill } from "@/util/skill-loader";
import type { RunLog } from "@/runs/run-log";
import { allowedTools, disallowedTools, canUseTool } from "./permissions.js";
import { passCheck } from "./pass-check.js";

const PROMPT = loadSkill(import.meta.url, "skill.md");

const CONFIG: AgentNodeConfig = {
  id: "engineer",
  name: "Engineer",
  role: "engineer",
  prompt: PROMPT,
  model: "claude-haiku-4-5",
  maxTurns: 200,
  budgetUsd: 15,
  allowedTools,
  disallowedTools,
  canUseTool,
  passCheck,
};

/**
 * The engineer agent operates inside the worktree set up by the Worktree
 * node. The base AgentNode now substitutes every string-valued state key,
 * so `{{issueId}}`, `{{branchName}}`, `{{worktreePath}}`, `{{baseBranch}}`
 * all resolve from `ctx.state` automatically.
 */
export class EngineerNode<
  TState extends {
    issueId: string;
    runId: string;
    branchName?: string;
    baseBranch?: string;
    worktreePath?: string;
  },
> extends AgentNode<TState> {
  constructor(runLog: RunLog, cwd: string) {
    super(CONFIG, runLog, cwd);
  }
}
