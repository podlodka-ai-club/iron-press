import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { logger } from "@/util/logger";
import type { Node, NodeContext, NodeStatus } from "@/sdk/workflow";
import type { RunLog } from "@/runs/run-log";
import { worktreeBranchName, worktreePathFor } from "./paths.js";
import { passCheck } from "./pass-check.js";

export interface WorktreeState {
  issueId: string;
  runId: string;
  branchName?: string;
  baseBranch?: string;
  worktreePath?: string;
}

/**
 * Deterministic node that creates a git branch + worktree for the engineer to
 * work in. Operates in a single repo (the workflow's `cwd`) — no multi-repo
 * mapping. Sets `state.branchName`, `state.baseBranch`, `state.worktreePath`
 * so downstream nodes (engineer, pull-request) can use them via `{{key}}`
 * substitution or via `state.X` directly.
 *
 * Branch naming: `agent/<issue-id-lowercased>`. Base branch: `main`. The
 * worktree lives under `<cwd>/.worktrees/<branch-with-slashes-replaced>`.
 */
export class WorktreeNode<TState extends WorktreeState> implements Node<TState> {
  readonly id = "worktree";
  readonly name = "Create Worktree";
  readonly passCheck = passCheck;

  private readonly _runLog: RunLog;
  private readonly _cwd: string;

  constructor(runLog: RunLog, cwd: string) {
    this._runLog = runLog;
    this._cwd = cwd;
  }

  async execute(ctx: NodeContext<TState>): Promise<{ status: NodeStatus }> {
    const stage = this._runLog.openStage({
      kind: "worktree",
      issueId: ctx.state.issueId,
    });

    const branchName = ctx.state.branchName ?? worktreeBranchName(ctx.state.issueId);
    const baseBranch = ctx.state.baseBranch ?? "main";
    const worktreePath = ctx.state.worktreePath ?? worktreePathFor(this._cwd, branchName);

    const log: string[] = [];
    const run = (cmd: string, args: string[]): string => {
      const out = execFileSync(cmd, args, { cwd: this._cwd, encoding: "utf8" });
      log.push(`$ ${cmd} ${args.join(" ")}\n${out}`);
      return out.trim();
    };

    try {
      run("git", ["fetch", "origin"]);

      mkdirSync(path.join(this._cwd, ".worktrees"), { recursive: true });

      if (!existsSync(worktreePath)) {
        try {
          run("git", [
            "worktree",
            "add",
            worktreePath,
            "-b",
            branchName,
            `origin/${baseBranch}`,
          ]);
        } catch {
          // Branch may already exist locally — fall back to attaching to it.
          run("git", ["worktree", "add", worktreePath, branchName]);
        }
      } else {
        log.push(`Worktree already exists at ${worktreePath} — reusing.`);
      }

      const actualBranch = execFileSync("git", ["branch", "--show-current"], {
        cwd: worktreePath,
        encoding: "utf8",
      }).trim();
      if (actualBranch !== branchName) {
        throw new Error(
          `Branch mismatch in worktree: expected "${branchName}", got "${actualBranch}"`,
        );
      }

      ctx.state.branchName = branchName;
      ctx.state.baseBranch = baseBranch;
      ctx.state.worktreePath = worktreePath;

      writeFileSync(
        stage.resultPath,
        JSON.stringify(
          {
            status: "Pass",
            branchName,
            baseBranch,
            worktreePath,
          },
          null,
          2,
        ),
      );
      writeFileSync(stage.stderrPath, log.join("\n"));

      logger.info({ branchName, worktreePath }, "[worktree] created");
      return { status: "Pass" };
    } catch (err) {
      const message = (err as Error).message;
      logger.error({ err }, "[worktree] failed");
      writeFileSync(
        stage.resultPath,
        JSON.stringify(
          { status: "Fail", errorMessage: message },
          null,
          2,
        ),
      );
      writeFileSync(stage.stderrPath, log.join("\n") + "\n" + message);
      return { status: "Fail" };
    }
  }
}
