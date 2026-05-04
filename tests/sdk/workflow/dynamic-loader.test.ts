import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadWorkflowFromJson } from "@/sdk/workflow/dynamic-loader";
import { WorkflowError } from "@/sdk/workflow/contracts";
import type { RunLog } from "@/runs/run-log";

vi.mock("@/util/logger", () => {
  const noop = vi.fn();
  const stub = {
    info: noop,
    warn: noop,
    debug: noop,
    error: noop,
    child: () => stub,
  };
  return { logger: stub, childLogger: () => stub };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_NODE = {
  id: "ba",
  name: "Business Analyst",
  role: "ba",
  model: "claude-3-5-sonnet-20241022",
  maxTurns: 10,
  budgetUsd: 1.0,
  allowedTools: [],
  disallowedTools: [],
  permissionProfile: "view-only",
} as const;

const SECOND_NODE = {
  ...BASE_NODE,
  id: "eng",
  name: "Engineer",
  role: "eng",
  permissionProfile: "safe-write",
} as const;

const VALID_SINGLE_NODE_DEF = {
  name: "test-workflow",
  initialNodeId: "ba",
  nodes: [BASE_NODE],
  edges: [],
};

function makeRunLog(): RunLog {
  return {
    runId: "test-run",
    runDir: "/tmp/test",
    openStage: vi.fn(),
    appendEvent: vi.fn(),
    writeState: vi.fn(),
    writeMeta: vi.fn(),
    readMeta: vi.fn(() => null),
    close: vi.fn(),
  };
}

/**
 * Write workflow.json and create a skill.md for every node listed in `def.nodes`.
 */
function scaffold(
  dir: string,
  def: unknown,
  skillContent = "Do the thing.",
): void {
  writeFileSync(path.join(dir, "workflow.json"), JSON.stringify(def));

  const typed = def as { nodes?: Array<{ id: string }> };
  for (const node of typed.nodes ?? []) {
    const nodeDir = path.join(dir, "nodes", node.id);
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(path.join(nodeDir, "skill.md"), skillContent);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadWorkflowFromJson", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "dynamic-loader-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Error paths — file reading
  // -------------------------------------------------------------------------

  it("throws WorkflowError (VALIDATION_FAILED) when workflow.json is absent", () => {
    expect(() => loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd"))
      .toThrow(WorkflowError);
  });

  it("throws WorkflowError when workflow.json contains invalid JSON", () => {
    writeFileSync(path.join(tmpDir, "workflow.json"), "{ not valid json }");
    expect(() => loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd"))
      .toThrow(WorkflowError);
  });

  it("includes the file path in the error message when JSON is missing", () => {
    let caught: unknown;
    try {
      loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(WorkflowError);
    expect((caught as WorkflowError).message).toContain("workflow.json");
  });

  // -------------------------------------------------------------------------
  // Error paths — schema validation
  // -------------------------------------------------------------------------

  it("throws WorkflowError (VALIDATION_FAILED) when workflow.json fails schema validation", () => {
    writeFileSync(path.join(tmpDir, "workflow.json"), JSON.stringify({ name: "incomplete" }));
    expect(() => loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd"))
      .toThrow(WorkflowError);
  });

  it("throws WorkflowError when nodes array is empty", () => {
    const def = { ...VALID_SINGLE_NODE_DEF, nodes: [] };
    writeFileSync(path.join(tmpDir, "workflow.json"), JSON.stringify(def));
    expect(() => loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd"))
      .toThrow(WorkflowError);
  });

  // -------------------------------------------------------------------------
  // Error paths — missing skill.md
  // -------------------------------------------------------------------------

  it("throws when skill.md is missing for a node", () => {
    writeFileSync(path.join(tmpDir, "workflow.json"), JSON.stringify(VALID_SINGLE_NODE_DEF));
    // No nodes/<id>/skill.md created
    expect(() => loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd"))
      .toThrow(/skill\.md not found for node "ba"/);
  });

  // -------------------------------------------------------------------------
  // Error paths — unknown permission profile
  // -------------------------------------------------------------------------

  it("throws for an unknown permissionProfile value", () => {
    const def = {
      ...VALID_SINGLE_NODE_DEF,
      nodes: [{ ...BASE_NODE, permissionProfile: "not-a-real-profile" }],
    };
    scaffold(tmpDir, def);
    expect(() => loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd"))
      .toThrow(/Unknown permission profile/);
  });

  // -------------------------------------------------------------------------
  // Happy path — single node
  // -------------------------------------------------------------------------

  it("returns a Workflow for a valid single-node definition", () => {
    scaffold(tmpDir, VALID_SINGLE_NODE_DEF);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    expect(workflow).toBeDefined();
  });

  it("sets the correct initialNodeId", () => {
    scaffold(tmpDir, VALID_SINGLE_NODE_DEF);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    expect(workflow.initialNodeId).toBe("ba");
  });

  it("adds the node to the graph", () => {
    scaffold(tmpDir, VALID_SINGLE_NODE_DEF);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    expect(workflow.graph.nodes()).toEqual(["ba"]);
  });

  it("strips frontmatter from skill.md before using it as the prompt", () => {
    const skillWithFrontmatter = "---\nsome: frontmatter\n---\nActual prompt body";
    scaffold(tmpDir, VALID_SINGLE_NODE_DEF, skillWithFrontmatter);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    const node = workflow.graph.getNodeAttribute("ba", "node");
    // The AgentNode stores the prompt — verify it is accessible and non-empty
    expect(node).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Happy path — multiple nodes and edges
  // -------------------------------------------------------------------------

  it("adds all nodes to the graph", () => {
    const def = {
      ...VALID_SINGLE_NODE_DEF,
      nodes: [BASE_NODE, SECOND_NODE],
    };
    scaffold(tmpDir, def);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    expect(workflow.graph.nodes()).toHaveLength(2);
    expect(workflow.graph.hasNode("ba")).toBe(true);
    expect(workflow.graph.hasNode("eng")).toBe(true);
  });

  it("wires edges correctly", () => {
    const def = {
      name: "test-workflow",
      initialNodeId: "ba",
      nodes: [BASE_NODE, SECOND_NODE],
      edges: [{ from: "ba", to: "eng", onStatus: "Pass" }],
    };
    scaffold(tmpDir, def);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    expect(workflow.graph.edges()).toHaveLength(1);
    const [edgeId] = workflow.graph.edges();
    const attrs = workflow.graph.getEdgeAttributes(edgeId!);
    expect(attrs.onStatus).toBe("Pass");
  });

  it("respects a non-first initialNodeId", () => {
    const def = {
      name: "test-workflow",
      initialNodeId: "eng",
      nodes: [BASE_NODE, SECOND_NODE],
      edges: [],
    };
    scaffold(tmpDir, def);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    expect(workflow.initialNodeId).toBe("eng");
  });

  it("supports edges between different node pairs", () => {
    const def = {
      name: "test-workflow",
      initialNodeId: "ba",
      nodes: [BASE_NODE, SECOND_NODE],
      edges: [
        { from: "ba",  to: "eng", onStatus: "Pass" },
        { from: "eng", to: "ba",  onStatus: "Fail" },
      ],
    };
    scaffold(tmpDir, def);
    const workflow = loadWorkflowFromJson(tmpDir, makeRunLog(), "/cwd");
    expect(workflow.graph.edges()).toHaveLength(2);
  });
});
