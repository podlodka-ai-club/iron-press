import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md;
  const end = md.indexOf("\n---", 3);
  if (end === -1) return md;
  return md.slice(md.indexOf("\n", end + 4) + 1).replace(/^\s+/, "");
}

/**
 * Load a prompt file sitting next to the calling node module.
 *
 * Usage inside a node's index.ts:
 *   const prompt = loadSkill(import.meta.url, "skill.md");
 */
export function loadSkill(moduleUrl: string, filename: string): string {
  const callerDir = path.dirname(fileURLToPath(moduleUrl));
  const filePath = path.join(callerDir, filename);
  return stripFrontmatter(readFileSync(filePath, "utf8"));
}

/**
 * Load a prompt file from an absolute path.
 * Used by the dynamic workflow loader where there is no module URL to resolve from.
 */
export function loadSkillFromPath(absolutePath: string): string {
  return stripFrontmatter(readFileSync(absolutePath, "utf8"));
}
