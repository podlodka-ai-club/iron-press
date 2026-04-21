import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

// Resolve the orchestrator's own location (.claude/orchestrator/src/config.ts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/config.ts → up to .claude/orchestrator → up to .claude → up to workspace
const orchestratorRoot = path.resolve(__dirname, "..");
const dotClaudeDir = path.resolve(orchestratorRoot, "..");
const defaultWorkspaceRoot = path.resolve(dotClaudeDir, "..");

function loadEnvFile(): void {
  const envPath = path.join(orchestratorRoot, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

export interface RoleBudget {
  model: string;
  maxTurns: number;
  budgetUsd: number;
}

export const config = {
  workspaceRoot: process.env.WORKSPACE_ROOT ?? defaultWorkspaceRoot,
  orchestratorRoot,
  dotClaudeDir,
  skillsDir: path.join(dotClaudeDir, "skills"),
  agentsDir: path.join(dotClaudeDir, "agents"),
  runsDir: path.join(orchestratorRoot, ".runs"),
  engLeadScriptsDir: path.join(dotClaudeDir, "skills", "eng-lead", "implement-issue", "scripts"),

  linearApiKey: process.env.LINEAR_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",

  maxRunUsd: Number(process.env.MAX_RUN_USD ?? "50"),

  // Per-role model + budget defaults. Overridable later via env.
  roles: {
    ba: { model: "claude-opus-4-7", maxTurns: 60, budgetUsd: 4 },
    baSlice: { model: "claude-opus-4-7", maxTurns: 60, budgetUsd: 4 },
    baCheckComments: { model: "claude-opus-4-7", maxTurns: 30, budgetUsd: 2 },
    po: { model: "claude-opus-4-7", maxTurns: 25, budgetUsd: 1.5 },
    tl: { model: "claude-opus-4-7", maxTurns: 80, budgetUsd: 6 },
    tlDesign: { model: "claude-opus-4-7", maxTurns: 60, budgetUsd: 4 },
    tlDesignBrainstorm: { model: "claude-opus-4-7", maxTurns: 60, budgetUsd: 4 },
    tlDesignFinalize: { model: "claude-opus-4-7", maxTurns: 40, budgetUsd: 3 },
    tlCheckComments: { model: "claude-opus-4-7", maxTurns: 30, budgetUsd: 2 },
    dev: { model: "claude-opus-4-7", maxTurns: 150, budgetUsd: 12 },
  } satisfies Record<string, RoleBudget>,

  // Keyword list — if any appears in a BA question, never auto-dispatch PO even in --lead=po.
  sensitiveKeywords: [
    "pricing",
    "legal",
    "compliance",
    "pii",
    "gdpr",
    "deletion",
    "security",
    "auth",
    "billing",
    "invoice",
    "refund",
    "regulatory",
    "contract",
  ],

  // Retry policy
  retry: {
    retries: 3,
    minTimeoutMs: 500,
    maxTimeoutMs: 8000,
    factor: 2,
  },
};

export type Config = typeof config;

export function assertConfig(): void {
  if (!config.linearApiKey) {
    throw new Error("LINEAR_API_KEY is required. Copy .env.example to .env and fill it in.");
  }
  // ANTHROPIC_API_KEY is OPTIONAL: if the Claude Code CLI is logged in
  // (`claude login`), the Agent SDK reuses those OAuth credentials and no API
  // key is needed. A subscription (Pro/Max/Team) is consumed instead of
  // pay-as-you-go API credits. Only enforce if neither is available.
}
