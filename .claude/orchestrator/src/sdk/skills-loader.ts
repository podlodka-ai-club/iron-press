import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

// Strip YAML frontmatter so it doesn't leak into the appended system prompt.
function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md;
  const end = md.indexOf("\n---", 3);
  if (end === -1) return md;
  return md.slice(md.indexOf("\n", end + 4) + 1).replace(/^\s+/, "");
}

/**
 * Load a skill file by its relative path under `.claude/skills/`, e.g.
 *   loadSkill("business-analyst/analyze-issue")
 *   loadSkill("business-analyst/analyze-issue/SKILL.md")
 *   loadSkill("tech-lead/architecture-design-brainstorm/finalize.md")
 */
export function loadSkill(relPath: string): string {
  const candidates: string[] = [];
  if (relPath.endsWith(".md")) {
    candidates.push(path.join(config.skillsDir, relPath));
  } else {
    candidates.push(path.join(config.skillsDir, relPath, "SKILL.md"));
  }
  for (const p of candidates) {
    if (existsSync(p)) {
      const raw = readFileSync(p, "utf8");
      return stripFrontmatter(raw);
    }
  }
  throw new Error(`Skill not found: ${relPath} (looked in ${candidates.join(", ")})`);
}

export function loadAgent(name: string): string {
  const p = path.join(config.agentsDir, `${name}.md`);
  if (!existsSync(p)) throw new Error(`Agent file not found: ${p}`);
  return stripFrontmatter(readFileSync(p, "utf8"));
}
