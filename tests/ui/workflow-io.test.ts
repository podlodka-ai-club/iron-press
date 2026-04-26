import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { listJsonWorkflows, readWorkflow, workflowExists, writeWorkflow } from "../../ui/workflow-io.js";

const VALID_NODE = {
  id: "ba",
  name: "Business Analyst",
  role: "business-analyst",
  model: "claude-haiku-4-5",
  maxTurns: 60,
  budgetUsd: 4,
  allowedTools: ["Read", "Grep"],
  disallowedTools: ["Edit"],
  permissionProfile: "view-only",
};

const VALID_DEFINITION = {
  name: "test-wf",
  initialNodeId: "ba",
  nodes: [VALID_NODE],
  edges: [],
};

let workflowsDir: string;

beforeEach(() => {
  workflowsDir = mkdtempSync(path.join(os.tmpdir(), "iron-press-wf-test-"));
});

afterEach(() => {
  rmSync(workflowsDir, { recursive: true, force: true });
});

function scaffoldWorkflow(
  name: string,
  def: unknown = VALID_DEFINITION,
  skills: Record<string, string> = {},
): void {
  const wfDir = path.join(workflowsDir, name);
  mkdirSync(wfDir, { recursive: true });
  writeFileSync(path.join(wfDir, "workflow.json"), JSON.stringify(def), "utf8");
  for (const [nodeId, content] of Object.entries(skills)) {
    const nodeDir = path.join(wfDir, "nodes", nodeId);
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(path.join(nodeDir, "skill.md"), content, "utf8");
  }
}

describe("listJsonWorkflows", () => {
  it("returns empty array when directory does not exist", () => {
    expect(listJsonWorkflows(path.join(workflowsDir, "nonexistent"))).toEqual([]);
  });

  it("returns empty array when no subdirectories have workflow.json", () => {
    mkdirSync(path.join(workflowsDir, "empty-dir"));
    expect(listJsonWorkflows(workflowsDir)).toEqual([]);
  });

  it("lists valid workflows sorted by name", () => {
    scaffoldWorkflow("zebra");
    scaffoldWorkflow("alpha");
    const list = listJsonWorkflows(workflowsDir);
    expect(list.map((w) => w.name)).toEqual(["alpha", "zebra"]);
  });

  it("returns correct summary fields", () => {
    scaffoldWorkflow("my-wf", {
      ...VALID_DEFINITION,
      nodes: [VALID_NODE, { ...VALID_NODE, id: "eng", name: "Eng" }],
      edges: [{ from: "ba", to: "eng", onStatus: "Pass" }],
    });
    const [summary] = listJsonWorkflows(workflowsDir);
    expect(summary!.name).toBe("my-wf");
    expect(summary!.nodeCount).toBe(2);
    expect(summary!.edgeCount).toBe(1);
    expect(summary!.initialNodeId).toBe("ba");
  });

  it("skips directories with invalid workflow.json", () => {
    scaffoldWorkflow("good");
    scaffoldWorkflow("bad", { invalid: true });
    expect(listJsonWorkflows(workflowsDir).map((w) => w.name)).toEqual(["good"]);
  });

  it("skips directories with malformed JSON", () => {
    const wfDir = path.join(workflowsDir, "broken");
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(path.join(wfDir, "workflow.json"), "{ not json }", "utf8");
    expect(listJsonWorkflows(workflowsDir)).toEqual([]);
  });
});

describe("readWorkflow", () => {
  it("returns null when workflow does not exist", () => {
    expect(readWorkflow(workflowsDir, "missing")).toBeNull();
  });

  it("returns null when workflow.json is invalid schema", () => {
    scaffoldWorkflow("bad", { name: "", initialNodeId: "", nodes: [], edges: [] });
    expect(readWorkflow(workflowsDir, "bad")).toBeNull();
  });

  it("reads definition and returns empty skills when no skill files exist", () => {
    scaffoldWorkflow("wf");
    const bundle = readWorkflow(workflowsDir, "wf");
    expect(bundle).not.toBeNull();
    expect(bundle!.name).toBe("wf");
    expect(bundle!.definition.initialNodeId).toBe("ba");
    expect(bundle!.skills["ba"]).toBe("");
  });

  it("reads skill.md content when present", () => {
    scaffoldWorkflow("wf", VALID_DEFINITION, { ba: "# Business Analyst\n\nDo analysis." });
    const bundle = readWorkflow(workflowsDir, "wf");
    expect(bundle!.skills["ba"]).toBe("# Business Analyst\n\nDo analysis.");
  });
});

describe("workflowExists", () => {
  it("returns false when workflow does not exist", () => {
    expect(workflowExists(workflowsDir, "no-such")).toBe(false);
  });

  it("returns true when workflow.json exists", () => {
    scaffoldWorkflow("wf");
    expect(workflowExists(workflowsDir, "wf")).toBe(true);
  });
});

describe("writeWorkflow", () => {
  it("creates workflow.json with correct content", () => {
    writeWorkflow(workflowsDir, { name: "wf", definition: VALID_DEFINITION, skills: {} });
    const written = JSON.parse(readFileSync(path.join(workflowsDir, "wf", "workflow.json"), "utf8")) as unknown;
    expect(written).toMatchObject({ name: "test-wf", initialNodeId: "ba" });
  });

  it("writes skill.md files for nodes with content", () => {
    writeWorkflow(workflowsDir, {
      name: "wf",
      definition: VALID_DEFINITION,
      skills: { ba: "# BA skill" },
    });
    const content = readFileSync(
      path.join(workflowsDir, "wf", "nodes", "ba", "skill.md"),
      "utf8",
    );
    expect(content).toBe("# BA skill");
  });

  it("skips skill.md write when content is empty", () => {
    writeWorkflow(workflowsDir, { name: "wf", definition: VALID_DEFINITION, skills: { ba: "" } });
    const skillPath = path.join(workflowsDir, "wf", "nodes", "ba", "skill.md");
    expect(() => readFileSync(skillPath)).toThrow();
  });

  it("overwrites existing workflow.json", () => {
    scaffoldWorkflow("wf");
    const updated = { ...VALID_DEFINITION, name: "updated" };
    writeWorkflow(workflowsDir, { name: "wf", definition: updated, skills: {} });
    const written = JSON.parse(readFileSync(path.join(workflowsDir, "wf", "workflow.json"), "utf8")) as { name: string };
    expect(written.name).toBe("updated");
  });

  it("removes orphaned node directories on update", () => {
    scaffoldWorkflow("wf", VALID_DEFINITION, { ba: "# BA" });
    const engNode = { ...VALID_NODE, id: "eng", name: "Engineer" };
    const updatedDef = { ...VALID_DEFINITION, nodes: [engNode], initialNodeId: "eng" };
    writeWorkflow(workflowsDir, { name: "wf", definition: updatedDef, skills: { eng: "# Eng" } });

    const baDir = path.join(workflowsDir, "wf", "nodes", "ba");
    const engDir = path.join(workflowsDir, "wf", "nodes", "eng");
    expect(() => readFileSync(path.join(baDir, "skill.md"))).toThrow();
    expect(readFileSync(path.join(engDir, "skill.md"), "utf8")).toBe("# Eng");
  });

  it("throws on invalid definition schema", () => {
    expect(() =>
      writeWorkflow(workflowsDir, {
        name: "bad",
        definition: { name: "", initialNodeId: "", nodes: [], edges: [] } as never,
        skills: {},
      }),
    ).toThrow("Invalid workflow definition");
  });

  it("round-trips: write then read returns same bundle", () => {
    const bundle = {
      name: "wf",
      definition: VALID_DEFINITION,
      skills: { ba: "# skill content" },
    };
    writeWorkflow(workflowsDir, bundle);
    const read = readWorkflow(workflowsDir, "wf");
    expect(read!.skills["ba"]).toBe("# skill content");
    expect(read!.definition.nodes[0]!.id).toBe("ba");
  });
});
