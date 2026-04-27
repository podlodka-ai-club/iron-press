import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import {
  NodeStatusSchema,
  type Node,
  type NodeContext,
  type NodeStatus,
} from "@/sdk/workflow";
import { stableSessionId, runSession } from "@/sdk/session";
import { logToolHook } from "./hooks";
import type { RunLog, StageDir } from "@/runs/run-log";
import { loadSkillWithFrontmatter as loadMarkdownWithFrontmatter } from "@/util/skill-loader";
import { resolvePermissionProfile } from "@/sdk/workflow/permission-profiles";
import { childLogger, type Logger } from "@/util/logger";

export interface AgentNodeConfig {
  /** Workflow-unique id used by edges. */
  id: string;
  /** Human-readable label. */
  name: string;
  /** Stage slug used for artifact directories and session derivation. */
  role: string;
  /** User-prompt from the node's `skill.md` (may contain the `{{issueId}}` placeholder) */
  prompt: string;
  model: string;
  maxTurns: number;
  budgetUsd: number;
  /** SDK tool allowlist — owned by the node folder. */
  allowedTools: string[];
  /** SDK tool denylist — owned by the node folder. */
  disallowedTools: string[];
  /** Runtime tool-use guard — owned by the node folder. */
  canUseTool: CanUseTool;
}

const SESSION_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    status: { enum: ["Pass", "Fail", "WaitUserInput"] },
  },
  required: ["status"],
  additionalProperties: false,
};

const StatusResponseSchema = z.object({ status: NodeStatusSchema });

export class AgentNode<
  TState extends { issueId: string; runId: string },
> implements Node<TState> {
  readonly id: string;
  readonly name: string;

  private readonly _config: AgentNodeConfig;
  private readonly _runLog: RunLog;
  private readonly _cwd: string;
  private readonly _log: Logger;

  constructor(config: AgentNodeConfig, runLog: RunLog, cwd: string) {
    this.id = config.id;
    this.name = config.name;
    this._config = config;
    this._runLog = runLog;
    this._cwd = cwd;
    this._log = childLogger({ nodeId: config.id, role: config.role });
  }

  static fromMd<TState extends { issueId: string; runId: string }>(
    mdUrl: URL,
    runLog: RunLog,
    cwd: string,
  ): AgentNode<TState> {
    const { frontmatter, body } = loadMarkdownWithFrontmatter(
      fileURLToPath(mdUrl),
    );
    return new AgentNode<TState>(
      {
        id: frontmatter.id,
        name: frontmatter.name,
        role: frontmatter.role,
        prompt: body,
        model: frontmatter.model,
        maxTurns: frontmatter.maxTurns,
        budgetUsd: frontmatter.budgetUsd,
        allowedTools: frontmatter.allowedTools,
        disallowedTools: frontmatter.disallowedTools,
        canUseTool: resolvePermissionProfile(frontmatter.permissions),
      },
      runLog,
      cwd,
    );
  }

  async execute(ctx: NodeContext<TState>): Promise<{ status: NodeStatus }> {
    const dir = this._runLog.openStage({
      kind: this._config.role,
      issueId: ctx.state.issueId,
    });
    const sessionId = stableSessionId(
      this._config.role,
      ctx.state.issueId,
      ctx.state.runId,
      dir.index,
    );
    const prompt = this._buildPrompt(ctx);

    writeFileSync(
      dir.promptPath,
      `# Prompt (role=${this._config.role}, session=${sessionId})\n\n${prompt}`,
    );

    this._log.info({ sessionId, issueId: ctx.state.issueId }, "session starting");
    const resultMsg = await runSession({
      cwd: this._cwd,
      sessionId,
      prompt,
      model: this._config.model,
      maxTurns: this._config.maxTurns,
      budgetUsd: this._config.budgetUsd,
      allowedTools: this._config.allowedTools,
      disallowedTools: this._config.disallowedTools,
      canUseTool: this._config.canUseTool,
      outputSchema: SESSION_OUTPUT_SCHEMA,
      hooks: {
        PreToolUse: [{ hooks: [logToolHook(dir.toolCallsPath, "pre")] }],
        PostToolUse: [{ hooks: [logToolHook(dir.toolCallsPath, "post")] }],
      },
      transcriptPath: dir.transcriptPath,
      stderrPath: dir.stderrPath,
    });
    if (!resultMsg) {
      return { status: this._writeFailed(dir, sessionId, "SDK session threw") };
    }

    const parsed = StatusResponseSchema.safeParse(resultMsg.structured_output);
    if (!parsed.success) {
      return {
        status: this._writeFailed(
          dir,
          sessionId,
          `invalid structured output: ${parsed.error.message}`,
        ),
      };
    }

    const status = parsed.data.status;
    this._writeResult(dir, sessionId, status, resultMsg);
    return { status };
  }

  protected _buildPrompt(ctx: NodeContext<TState>): string {
    return this._config.prompt.replaceAll("{{issueId}}", ctx.state.issueId);
  }

  private _writeResult(
    dir: StageDir,
    sessionId: string,
    status: NodeStatus,
    resultMsg: Record<string, unknown>,
  ): void {
    const costUsd = Number(resultMsg.total_cost_usd ?? 0);
    const usage = (resultMsg.usage ?? {}) as Record<string, number | undefined>;
    this._log.info(
      {
        status,
        costUsd,
        tokens: {
          input: Number(usage.input_tokens ?? 0),
          output: Number(usage.output_tokens ?? 0),
          cacheRead: Number(usage.cache_read_input_tokens ?? 0),
          cacheCreation: Number(usage.cache_creation_input_tokens ?? 0),
        },
      },
      "session complete",
    );
    writeFileSync(
      dir.resultPath,
      JSON.stringify(
        {
          status,
          sessionId,
          transcriptPath: dir.transcriptPath,
          costUsd,
          tokens: {
            input: Number(usage.input_tokens ?? 0),
            output: Number(usage.output_tokens ?? 0),
            cacheRead: Number(usage.cache_read_input_tokens ?? 0),
            cacheCreation: Number(usage.cache_creation_input_tokens ?? 0),
          },
        },
        null,
        2,
      ),
    );
  }

  private _writeFailed(
    dir: StageDir,
    sessionId: string,
    message: string,
  ): NodeStatus {
    this._log.warn({ message, sessionId }, "session failed");
    try {
      writeFileSync(
        dir.resultPath,
        JSON.stringify(
          {
            status: "Fail" satisfies NodeStatus,
            sessionId,
            transcriptPath: dir.transcriptPath,
            errorMessage: message,
          },
          null,
          2,
        ),
      );
    } catch {}
    return "Fail";
  }
}
