import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { AppConfigSchema, type AppConfig } from "./config/app-config-schema.js";

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

function loadAppConfig(): AppConfig | undefined {
  const configPath = path.join(orchestratorRoot, "iron-press.config.json");
  if (!existsSync(configPath)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    return AppConfigSchema.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[iron-press] Failed to load iron-press.config.json: ${(err as Error).message}`);
    return undefined;
  }
}

const appConfig = loadAppConfig();

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
  githubToken: process.env.GITHUB_TOKEN ?? "",

  maxRunUsd: Number(process.env.MAX_RUN_USD ?? "50"),

  appConfig,

  // Polling configuration — JSON config takes priority over env vars
  pollingTeamId: appConfig?.linear?.teamId ?? process.env.POLL_TEAM_ID ?? "",
  pollingProjectId: appConfig?.linear?.projectId ?? process.env.POLL_PROJECT_ID ?? "",
  pollingIntervalMs: appConfig?.linear?.pollIntervalMs ?? Number(process.env.POLL_INTERVAL_MS ?? "30000"),
  pollingIncludeStatuses:
    appConfig?.linear?.includeStatuses ??
    (process.env.POLL_INCLUDE_STATUSES ?? "Backlog").split(",").map((s) => s.trim()),
  pollingLookbackMs:
    appConfig?.linear?.pollLookbackMs ??
    (process.env.POLL_LOOKBACK_MS ? Number(process.env.POLL_LOOKBACK_MS) : undefined),
  pollingExcludeStatuses:
    appConfig?.linear?.excludeStatuses ??
    (process.env.POLL_EXCLUDE_STATUSES ?? "Done,Canceled").split(",").map((s) => s.trim()),

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
  if (process.env.DEV_MODE === "1") {
    return;
  }

  if (!config.linearApiKey) {
    throw new Error("LINEAR_API_KEY is required. Copy .env.example to .env and fill it in.");
  }
  // ANTHROPIC_API_KEY is OPTIONAL: if the Claude Code CLI is logged in
  // (`claude login`), the Agent SDK reuses those OAuth credentials and no API
  // key is needed. A subscription (Pro/Max/Team) is consumed instead of
  // pay-as-you-go API credits. Only enforce if neither is available.
}
