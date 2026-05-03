import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// FIXME[catalog-io]: mirrors src/catalog/catalog-io.ts — extract to shared package

export interface AgentConfig {
  model: string;
  maxTurns: number;
  budgetUsd: number;
  allowedTools: string[];
  disallowedTools: string[];
  permissionProfile: string;
}

export interface AgentDefinition {
  role: string;
  label: string;
  color: string;
  defaultNodeId: string;
  nodeType: "agent" | "script";
  scriptKind?: string;
  builtin?: boolean;
  defaultPassCheckRef?: string;
  defaultConfig: AgentConfig;
  /** Loaded from skill.md alongside definition.json. */
  defaultSkill: string;
}

export function listAgents(catalogDir: string): AgentDefinition[] {
  const agentsDir = path.join(catalogDir, "agents");
  if (!existsSync(agentsDir)) return [];
  const entries = readdirSync(agentsDir, { withFileTypes: true });
  const agents: AgentDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const def = readAgent(catalogDir, entry.name);
    if (def) agents.push(def);
  }
  return agents.sort((a, b) => a.role.localeCompare(b.role));
}

export function readAgent(catalogDir: string, role: string): AgentDefinition | null {
  const defPath = path.join(catalogDir, "agents", role, "definition.json");
  if (!existsSync(defPath)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(defPath, "utf8"));
  } catch {
    return null;
  }

  const base = raw as Omit<AgentDefinition, "defaultSkill">;
  const skillPath = path.join(catalogDir, "agents", role, "skill.md");
  const defaultSkill = existsSync(skillPath) ? readFileSync(skillPath, "utf8") : "";

  return { ...base, defaultSkill };
}

export function writeAgent(catalogDir: string, def: AgentDefinition): void {
  const dir = path.join(catalogDir, "agents", def.role);
  mkdirSync(dir, { recursive: true });
  const { defaultSkill, ...defWithoutSkill } = def;
  writeFileSync(
    path.join(dir, "definition.json"),
    JSON.stringify(defWithoutSkill, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(path.join(dir, "skill.md"), defaultSkill, "utf8");
}

export function deleteAgent(catalogDir: string, role: string): void {
  const dir = path.join(catalogDir, "agents", role);
  if (!existsSync(dir)) throw new Error(`Agent not found: ${role}`);
  rmSync(dir, { recursive: true, force: true });
}

export function agentExists(catalogDir: string, role: string): boolean {
  return existsSync(path.join(catalogDir, "agents", role, "definition.json"));
}
