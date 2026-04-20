import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { WorkUnit } from "../types/contracts.js";
import { config } from "../config.js";

export type StageRole =
  | "ba"
  | "ba-slice"
  | "ba-check-comments"
  | "po"
  | "tl"
  | "tl-design"
  | "tl-design-brainstorm"
  | "tl-design-finalize"
  | "tl-check-comments"
  | "dev";

export interface PermissionContext {
  role: StageRole;
  workUnit?: WorkUnit; // only for dev role
}

const READ_ONLY_ROLES: StageRole[] = [
  "ba",
  "ba-slice",
  "ba-check-comments",
  "po",
  "tl",
  "tl-design",
  "tl-design-brainstorm",
  "tl-design-finalize",
  "tl-check-comments",
];

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

export function makePermissionGuard(ctx: PermissionContext): CanUseTool {
  return async (toolName, input) => {
    // Read-only roles must not touch the filesystem or run shell commands.
    if (READ_ONLY_ROLES.includes(ctx.role)) {
      if (toolName === "Edit" || toolName === "Write" || toolName === "NotebookEdit") {
        return { behavior: "deny", message: `${ctx.role} may not write files` };
      }
      if (toolName === "Bash") {
        return { behavior: "deny", message: `${ctx.role} may not run bash` };
      }
    }

    if (ctx.role === "dev") {
      if (!ctx.workUnit) {
        return { behavior: "deny", message: "dev role requires a workUnit" };
      }
      const wt = ctx.workUnit.worktreePath;

      if (toolName === "Edit" || toolName === "Write" || toolName === "NotebookEdit") {
        const raw = input as Record<string, unknown>;
        const candidate = (raw.file_path ?? raw.path ?? raw.notebookPath) as string | undefined;
        if (!candidate) return { behavior: "deny", message: "missing file path" };
        if (!isInside(candidate, wt)) {
          return { behavior: "deny", message: `writes must stay in ${wt}` };
        }
        if (FORBIDDEN_PATH_PREFIXES.some((p) => candidate.startsWith(p))) {
          return { behavior: "deny", message: `forbidden path prefix` };
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
    }

    // Global budget check — the stage runner sets maxBudgetUsd on each session, but we
    // additionally deny if the caller marks the session as over-budget via env.
    if (process.env.ORCH_OVER_BUDGET === "1") {
      return { behavior: "deny", message: "global run budget exceeded" };
    }

    return { behavior: "allow" };
  };
}

function isInside(child: string, parent: string): boolean {
  // Normalise trailing slashes
  const a = child.replace(/\/+$/, "");
  const b = parent.replace(/\/+$/, "");
  return a === b || a.startsWith(b + "/");
}

// =============================================================================
// Allowed-tool lists per role
// =============================================================================

export function allowedToolsFor(role: StageRole): string[] {
  // `linear` is registered in the project-level `.mcp.json`, so its tools surface
  // under `mcp__linear__*`. Figma comes from the plugin system under the
  // plugin-prefixed name.
  const linearTools = ["mcp__linear__*"];
  const figmaTools = ["mcp__plugin_figma_figma__*"];
  const research = ["Read", "Grep", "Glob", "WebFetch"];
  switch (role) {
    case "ba":
    case "ba-slice":
    case "ba-check-comments":
      return [...research, ...linearTools, ...figmaTools];
    case "po":
      return [...research, ...linearTools];
    case "tl":
    case "tl-design":
    case "tl-design-brainstorm":
    case "tl-design-finalize":
    case "tl-check-comments":
      return [...research, ...linearTools];
    case "dev":
      return [...research, "Edit", "Write", "Bash", ...linearTools];
    default:
      return research;
  }
}

export function disallowedToolsFor(role: StageRole): string[] {
  if (role === "dev") return [];
  return ["Edit", "Write", "Bash", "NotebookEdit"];
}

export { config as _config };
