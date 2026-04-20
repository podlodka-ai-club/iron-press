import { describe, expect, it } from "vitest";
import { deriveRunStatus, deriveStageStatus, roleColour } from "../../ui/status.js";

describe("deriveRunStatus", () => {
  it("done when pipeline_complete event exists", () => {
    expect(deriveRunStatus({ startedAt: "t" }, ["run_started", "pipeline_complete"])).toBe("done");
  });

  it("blocked when exit_blocked event exists", () => {
    expect(deriveRunStatus({ startedAt: "t" }, ["run_started", "exit_blocked"])).toBe("blocked");
  });

  it("error for any exit_error/all_failed/budget_exceeded/mcp_missing", () => {
    for (const t of ["exit_error", "exit_all_failed", "exit_budget_exceeded", "exit_mcp_missing"]) {
      expect(deriveRunStatus({ startedAt: "t" }, ["run_started", t])).toBe("error");
    }
  });

  it("running when only run_started seen and not finished", () => {
    expect(deriveRunStatus({ startedAt: "t" }, ["run_started"])).toBe("running");
  });

  it("done when finishedAt set with exitCode 0, no terminal event", () => {
    expect(
      deriveRunStatus({ startedAt: "a", finishedAt: "b", exitCode: 0 }, ["run_started"]),
    ).toBe("done");
  });

  it("error when finishedAt set with non-zero exitCode, no terminal event", () => {
    expect(
      deriveRunStatus({ startedAt: "a", finishedAt: "b", exitCode: 1 }, ["run_started"]),
    ).toBe("error");
    expect(
      deriveRunStatus({ startedAt: "a", finishedAt: "b", exitCode: 130 }, ["run_started"]),
    ).toBe("error");
  });

  it("error when finishedAt present without exitCode (killed mid-write)", () => {
    expect(deriveRunStatus({ startedAt: "a", finishedAt: "b" }, ["run_started"])).toBe("error");
  });

  it("unknown when nothing available", () => {
    expect(deriveRunStatus(null, [])).toBe("unknown");
  });

  it("exit_idle counts as done", () => {
    expect(deriveRunStatus({ startedAt: "t" }, ["run_started", "exit_idle"])).toBe("done");
  });
});

describe("deriveStageStatus", () => {
  it("running when no result", () => {
    expect(deriveStageStatus(null)).toBe("running");
  });
  it("done/blocked from result.status", () => {
    expect(deriveStageStatus({ status: "done" })).toBe("done");
    expect(deriveStageStatus({ status: "blocked" })).toBe("blocked");
  });
  it("result.status 'failed' renders as error", () => {
    expect(deriveStageStatus({ status: "failed" })).toBe("error");
  });
  it("unknown for unrecognised status", () => {
    expect(deriveStageStatus({ status: "weird" as unknown as "done" })).toBe("unknown");
  });
});

describe("roleColour", () => {
  it.each([
    ["ba", "yellow"],
    ["ba-slice", "yellow"],
    ["ba-check-comments", "yellow"],
    ["po", "purple"],
    ["tl", "blue"],
    ["tl-design", "blue"],
    ["tl-design-finalize", "blue"],
    ["tl-check-comments", "blue"],
    ["code", "orange"],
    ["dev-backend", "pink"],
    ["dev-frontend", "cyan"],
    ["pm", "green"],
    ["mystery", "gray"],
  ])("%s → %s", (kind, colour) => {
    expect(roleColour(kind)).toBe(colour);
  });
});
