import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RepoPrepareOptions {
  url: string;
  cloneDir?: string;
  baseBranch?: string;
}

function repoNameFromUrl(url: string): string {
  return url.replace(/.*\/([^/]+?)(?:\.git)?$/, "$1");
}

export function prepareRepository(opts: RepoPrepareOptions): string {
  const repoName = repoNameFromUrl(opts.url);
  const targetDir = opts.cloneDir ?? path.join(os.tmpdir(), `iron-press-${repoName}`);
  const baseBranch = opts.baseBranch ?? "main";

  if (existsSync(path.join(targetDir, ".git"))) {
    execFileSync("git", ["fetch", "origin"], { cwd: targetDir, stdio: "pipe" });
    execFileSync("git", ["checkout", baseBranch], { cwd: targetDir, stdio: "pipe" });
    execFileSync("git", ["pull", "origin", baseBranch, "--rebase"], { cwd: targetDir, stdio: "pipe" });
  } else {
    mkdirSync(path.dirname(targetDir), { recursive: true });
    execFileSync("git", ["clone", opts.url, targetDir], { stdio: "pipe" });
  }

  return targetDir;
}
