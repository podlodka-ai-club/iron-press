import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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

// ---------------------------------------------------------------------------
// Frontmatter schema + parser
// ---------------------------------------------------------------------------

export const SkillFrontmatterSchema = z.object({
  id:              z.string().min(1),
  name:            z.string().min(1),
  role:            z.string().min(1),
  model:           z.string().min(1),
  maxTurns:        z.number().int().positive(),
  budgetUsd:       z.number().positive(),
  allowedTools:    z.array(z.string()).default([]),
  disallowedTools: z.array(z.string()).default([]),
  permissions:     z.string().min(1),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

function parseSimpleYaml(block: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "" || line.trimStart().startsWith("#")) continue;

    if (/^\s+-\s+/.test(line)) {
      const value = line.replace(/^\s+-\s+/, "").trim();
      if (currentKey !== null && currentArray !== null) {
        currentArray.push(value);
      }
      continue;
    }

    if (currentKey !== null && currentArray !== null) {
      result[currentKey] = currentArray;
    }
    currentArray = null;
    currentKey = null;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (rest === "") {
      currentKey = key;
      currentArray = [];
    } else {
      const asNum = Number(rest);
      result[key] = rest !== "" && !Number.isNaN(asNum) ? asNum : rest.replace(/^["']|["']$/g, "");
    }
  }

  if (currentKey !== null && currentArray !== null) {
    result[currentKey] = currentArray;
  }

  return result;
}

export function parseSkillFrontmatter(md: string): SkillFrontmatter {
  if (!md.startsWith("---")) throw new Error("skill.md has no YAML frontmatter block");
  const end = md.indexOf("\n---", 3);
  if (end === -1) throw new Error("skill.md frontmatter block is not closed");
  const block = md.slice(4, end);
  const raw = parseSimpleYaml(block);
  const result = SkillFrontmatterSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid skill.md frontmatter: ${result.error.message}`);
  return result.data;
}

export function loadSkillWithFrontmatter(absolutePath: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const md = readFileSync(absolutePath, "utf8");
  return { frontmatter: parseSkillFrontmatter(md), body: stripFrontmatter(md) };
}
