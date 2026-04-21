#!/usr/bin/env node
import { Command } from "commander";
import { orchestrate } from "./orchestrator.js";
import { FlagsSchema } from "./types/contracts.js";
import { logger } from "./util/logger.js";

const program = new Command();

program
  .name("orchestrate")
  .description("Drive a Linear issue or project through the agent pipeline")
  .argument("[root]", "Linear issue identifier (ENG-123), issue URL, or project URL")
  .option("--ba <mode>", "how to bootstrap (analyze|slice)", "analyze")
  .option("--design <mode>", "TL design flow for Slice 0 (direct|brainstorm)", "direct")
  .option("--lead <who>", "who answers BA questions (human|po)", "human")
  .option("--max-po-auto <n>", "cap on auto-PO dispatches (lead=po only)", "3")
  .option("--dry-run", "planner only — no SDK calls")
  .option("--max-budget-usd <n>", "max total USD spend for the run", "50")
  .option("--resume <runId>", "replay a previous run's state and continue")
  .option("--stages <list>", "restrict which stages may run (comma-separated kinds)")
  .option("--no-code", "never dispatch /code (plan + design only)")
  .option("-v, --verbose", "verbose logging")
  .action(async (rootArg: string | undefined, rawOpts: Record<string, unknown>) => {
    if (rawOpts.verbose) {
      (logger as unknown as { level: string }).level = "debug";
    }

    if (!rootArg && !rawOpts.resume) {
      program.error("Provide a Linear issue id, issue URL, or project URL (or --resume <runId>).");
    }

    const flagsParse = FlagsSchema.safeParse({
      ba: rawOpts.ba,
      design: rawOpts.design,
      lead: rawOpts.lead,
      maxPoAuto: Number(rawOpts.maxPoAuto ?? "3"),
      dryRun: Boolean(rawOpts.dryRun),
      maxBudgetUsd: Number(rawOpts.maxBudgetUsd ?? "50"),
      stages: typeof rawOpts.stages === "string" ? (rawOpts.stages as string).split(",").map((s) => s.trim()) : undefined,
      noCode: rawOpts.code === false,
      resume: rawOpts.resume as string | undefined,
      verbose: Boolean(rawOpts.verbose),
    });
    if (!flagsParse.success) {
      program.error("Invalid flags: " + flagsParse.error.message);
      return;
    }
    const flags = flagsParse.data;

    const started = Date.now();
    const result = await orchestrate({
      rootInput: rootArg ?? "",
      flags,
      runId: flags.resume,
    });
    const durationSec = ((Date.now() - started) / 1000).toFixed(1);

    process.stderr.write(
      `\n  run:      ${result.runId}\n  dir:      ${result.runDir}\n  stages:   ${result.stageCount}\n  cost USD: ${result.totalCostUsd.toFixed(2)}\n  duration: ${durationSec}s\n  exit:     ${result.exitCode}\n\n`,
    );
    process.exit(result.exitCode);
  });

process.on("SIGINT", () => {
  logger.warn("SIGINT — exiting");
  process.exit(130);
});
process.on("SIGTERM", () => {
  logger.warn("SIGTERM — exiting");
  process.exit(143);
});

program.parseAsync(process.argv).catch((err) => {
  logger.error({ err }, "top-level error");
  process.exit(1);
});
