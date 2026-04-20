import path from "node:path";
import { writeFileSync } from "node:fs";
import type { Blocker } from "../types/contracts.js";

export function writeBlockersReport(runDir: string, blockers: Blocker[]): void {
  writeFileSync(path.join(runDir, "blockers.json"), JSON.stringify(blockers, null, 2));
}

export function renderBlockersReport(blockers: Blocker[]): string {
  if (blockers.length === 0) return "No blockers.";
  const lines: string[] = [
    "",
    "===============================================================",
    "  Orchestrator stopped — awaiting input on Linear",
    "===============================================================",
    "",
    `${blockers.length} issue(s) need attention. Answer each on Linear,`,
    "then re-run the orchestrator with the same root id (or --resume).",
    "",
  ];
  for (const b of blockers) {
    lines.push(`  • [${b.issueId}] ${b.title}`);
    lines.push(`      kind:   ${b.kind}`);
    lines.push(`      url:    ${b.issueUrl}`);
    lines.push(`      action: ${b.description}`);
    if (b.questionThreadBody) {
      const preview = b.questionThreadBody.split("\n").slice(0, 6).join("\n          ");
      lines.push(`      thread: ${preview}`);
    }
    lines.push("");
  }
  lines.push("===============================================================");
  return lines.join("\n");
}
