import { describe, expect, it, vi } from "vitest";
import {
  GraphologyEngine,
  WorkflowBuilder,
  WorkflowError,
} from "../../../src/sdk/workflow/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal state shape used across most tests. */
type State = { log: string[] };

function makeState(): State {
  return { log: [] };
}

// ---------------------------------------------------------------------------
// Linear workflow — Pass chains A → B → C
// ---------------------------------------------------------------------------

describe("linear workflow", () => {
  it("visits every node in order and ends when no outgoing edge matches", async () => {
    const workflow = new WorkflowBuilder<State>()
      .addNode({
        id: "a", name: "A",
        execute: async (ctx) => { ctx.state.log.push("a"); return { status: "Pass" }; },
      })
      .addNode({
        id: "b", name: "B",
        execute: async (ctx) => { ctx.state.log.push("b"); return { status: "Pass" }; },
      })
      .addNode({
        id: "c", name: "C",
        execute: async (ctx) => { ctx.state.log.push("c"); return { status: "Pass" }; },
      })
      .addEdge("a", "b", "Pass")
      .addEdge("b", "c", "Pass")
      .setInitialNode("a")
      .build();

    const result = await new GraphologyEngine<State>().run(workflow, makeState());

    expect(result.finalState.log).toEqual(["a", "b", "c"]);
    expect(result.finalStatus).toBe("Pass");
    expect(result.exitReason).toBe("no-matching-edge"); // "c" has no outgoing Pass edge
    expect(result.history.map((h) => h.nodeId)).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// Branching — Pass → success path, Fail → error path
// ---------------------------------------------------------------------------

describe("branching workflow", () => {
  function buildBranchWorkflow(outcome: "Pass" | "Fail") {
    return new WorkflowBuilder<State>()
      .addNode({
        id: "validate", name: "Validate",
        execute: async () => ({ status: outcome }),
      })
      .addNode({
        id: "success", name: "Success",
        execute: async (ctx) => { ctx.state.log.push("success"); return { status: "Pass" }; },
      })
      .addNode({
        id: "error", name: "Error",
        execute: async (ctx) => { ctx.state.log.push("error"); return { status: "Fail" }; },
      })
      .addEdge("validate", "success", "Pass")
      .addEdge("validate", "error", "Fail")
      .setInitialNode("validate")
      .build();
  }

  it("follows Pass edge to success node", async () => {
    const result = await new GraphologyEngine<State>().run(buildBranchWorkflow("Pass"), makeState());
    expect(result.finalState.log).toEqual(["success"]);
    expect(result.history.map((h) => h.nodeId)).toEqual(["validate", "success"]);
  });

  it("follows Fail edge to error node", async () => {
    const result = await new GraphologyEngine<State>().run(buildBranchWorkflow("Fail"), makeState());
    expect(result.finalState.log).toEqual(["error"]);
    expect(result.history.map((h) => h.nodeId)).toEqual(["validate", "error"]);
  });
});

// ---------------------------------------------------------------------------
// WaitUserInput — suspends immediately without following any edge
// ---------------------------------------------------------------------------

describe("WaitUserInput", () => {
  it("suspends the workflow and returns terminal-status exit reason", async () => {
    const workflow = new WorkflowBuilder<State>()
      .addNode({
        id: "gather", name: "Gather input",
        execute: async (ctx) => { ctx.state.log.push("gather"); return { status: "WaitUserInput" }; },
      })
      .addNode({
        id: "process", name: "Process",
        execute: async (ctx) => { ctx.state.log.push("process"); return { status: "Pass" }; },
      })
      // Edge exists, but WaitUserInput must NOT follow it
      .addEdge("gather", "process", "Pass")
      .setInitialNode("gather")
      .build();

    const result = await new GraphologyEngine<State>().run(workflow, makeState());

    expect(result.finalStatus).toBe("WaitUserInput");
    expect(result.exitReason).toBe("terminal-status");
    // "process" must never have been visited
    expect(result.finalState.log).toEqual(["gather"]);
    expect(result.history).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// State mutation — state is shared by reference across all nodes
// ---------------------------------------------------------------------------

describe("state mutation", () => {
  it("accumulates state changes across nodes", async () => {
    type Counter = { count: number };

    const workflow = new WorkflowBuilder<Counter>()
      .addNode({
        id: "inc1", name: "Inc 1",
        execute: async (ctx) => { ctx.state.count += 1; return { status: "Pass" }; },
      })
      .addNode({
        id: "inc2", name: "Inc 2",
        execute: async (ctx) => { ctx.state.count += 10; return { status: "Pass" }; },
      })
      .addNode({
        id: "inc3", name: "Inc 3",
        execute: async (ctx) => { ctx.state.count *= 2; return { status: "Pass" }; },
      })
      .addEdge("inc1", "inc2", "Pass")
      .addEdge("inc2", "inc3", "Pass")
      .setInitialNode("inc1")
      .build();

    const result = await new GraphologyEngine<Counter>().run(workflow, { count: 0 });
    // (0 + 1 + 10) * 2 = 22
    expect(result.finalState.count).toBe(22);
  });
});

// ---------------------------------------------------------------------------
// Node lifecycle hooks — onEnter and onExit
// ---------------------------------------------------------------------------

describe("node lifecycle hooks", () => {
  it("calls onEnter before execute and onExit after, passing the produced status", async () => {
    const calls: string[] = [];

    const workflow = new WorkflowBuilder<State>()
      .addNode({
        id: "step", name: "Step",
        onEnter: async () => { calls.push("onEnter"); },
        execute: async () => { calls.push("execute"); return { status: "Pass" }; },
        onExit: async (_ctx, status) => { calls.push(`onExit:${status}`); },
      })
      .setInitialNode("step")
      .build();

    await new GraphologyEngine<State>().run(workflow, makeState());

    expect(calls).toEqual(["onEnter", "execute", "onExit:Pass"]);
  });
});

// ---------------------------------------------------------------------------
// Engine-level hooks
// ---------------------------------------------------------------------------

describe("engine-level hooks", () => {
  it("fires onNodeEnter, onNodeExit, onTransition, and onTerminate in order", async () => {
    const events: string[] = [];

    const workflow = new WorkflowBuilder<State>()
      .addNode({
        id: "first", name: "First",
        execute: async () => ({ status: "Pass" }),
      })
      .addNode({
        id: "last", name: "Last",
        execute: async () => ({ status: "Pass" }),
      })
      .addEdge("first", "last", "Pass")
      .setInitialNode("first")
      .build();

    await new GraphologyEngine<State>().run(workflow, makeState(), {
      onNodeEnter: async (nodeId) => { events.push(`enter:${nodeId}`); },
      onNodeExit: async (nodeId, status) => { events.push(`exit:${nodeId}:${status}`); },
      onTransition: async (from, to, status) => { events.push(`transition:${from}->${to}:${status}`); },
      onTerminate: async (result) => { events.push(`terminate:${result.finalStatus}`); },
    });

    expect(events).toEqual([
      "enter:first",
      "exit:first:Pass",
      "transition:first->last:Pass",
      "enter:last",
      "exit:last:Pass",
      "terminate:Pass",
    ]);
  });

  it("onTerminate receives the correct final state", async () => {
    const workflow = new WorkflowBuilder<State>()
      .addNode({
        id: "node", name: "Node",
        execute: async (ctx) => { ctx.state.log.push("done"); return { status: "Fail" }; },
      })
      .setInitialNode("node")
      .build();

    const terminated = vi.fn();
    await new GraphologyEngine<State>().run(workflow, makeState(), { onTerminate: terminated });

    expect(terminated).toHaveBeenCalledOnce();
    expect(terminated.mock.calls[0]![0].finalState.log).toEqual(["done"]);
    expect(terminated.mock.calls[0]![0].finalStatus).toBe("Fail");
  });
});

// ---------------------------------------------------------------------------
// History and visit counts
// ---------------------------------------------------------------------------

describe("history", () => {
  it("records a history entry for every node visit", async () => {
    const workflow = new WorkflowBuilder<State>()
      .addNode({ id: "a", name: "Alpha", execute: async () => ({ status: "Pass" }) })
      .addNode({ id: "b", name: "Beta", execute: async () => ({ status: "Fail" }) })
      .addEdge("a", "b", "Pass")
      .setInitialNode("a")
      .build();

    const { history, visitCounts } = await new GraphologyEngine<State>().run(workflow, makeState());

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ nodeId: "a", nodeName: "Alpha", status: "Pass", visitIndex: 0 });
    expect(history[1]).toMatchObject({ nodeId: "b", nodeName: "Beta", status: "Fail", visitIndex: 0 });
    expect(visitCounts).toEqual({ a: 1, b: 1 });
  });
});

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

describe("cycle detection", () => {
  it("throws VISIT_LIMIT_EXCEEDED when a node is visited more than maxVisitsPerNode times", async () => {
    const workflow = new WorkflowBuilder<State>()
      .addNode({ id: "loop", name: "Loop", execute: async () => ({ status: "Pass" }) })
      .addEdge("loop", "loop", "Pass") // self-loop
      .setInitialNode("loop")
      .build();

    await expect(
      new GraphologyEngine<State>().run(workflow, makeState(), {}, { maxVisitsPerNode: 3 }),
    ).rejects.toThrow(WorkflowError);

    await expect(
      new GraphologyEngine<State>().run(workflow, makeState(), {}, { maxVisitsPerNode: 3 }),
    ).rejects.toMatchObject({ kind: "VISIT_LIMIT_EXCEEDED" });
  });
});

// ---------------------------------------------------------------------------
// Builder validation errors
// ---------------------------------------------------------------------------

describe("WorkflowBuilder validation", () => {
  it("throws MISSING_INITIAL_NODE when setInitialNode is not called", () => {
    expect(() =>
      new WorkflowBuilder<State>()
        .addNode({ id: "a", name: "A", execute: async () => ({ status: "Pass" }) })
        .build(),
    ).toThrow(WorkflowError);

    expect(() =>
      new WorkflowBuilder<State>()
        .addNode({ id: "a", name: "A", execute: async () => ({ status: "Pass" }) })
        .build(),
    ).toThrowError(expect.objectContaining({ kind: "MISSING_INITIAL_NODE" }));
  });

  it("throws MISSING_INITIAL_NODE when setInitialNode references a non-existent node", () => {
    expect(() =>
      new WorkflowBuilder<State>()
        .addNode({ id: "a", name: "A", execute: async () => ({ status: "Pass" }) })
        .setInitialNode("does-not-exist")
        .build(),
    ).toThrowError(expect.objectContaining({ kind: "MISSING_INITIAL_NODE" }));
  });

  it("throws VALIDATION_FAILED on duplicate node id", () => {
    expect(() =>
      new WorkflowBuilder<State>()
        .addNode({ id: "a", name: "A", execute: async () => ({ status: "Pass" }) })
        .addNode({ id: "a", name: "A duplicate", execute: async () => ({ status: "Pass" }) }),
    ).toThrowError(expect.objectContaining({ kind: "VALIDATION_FAILED" }));
  });

  it("throws VALIDATION_FAILED when an edge references an unknown node", () => {
    expect(() =>
      new WorkflowBuilder<State>()
        .addNode({ id: "a", name: "A", execute: async () => ({ status: "Pass" }) })
        .addEdge("a", "ghost", "Pass")
        .setInitialNode("a")
        .build(),
    ).toThrowError(expect.objectContaining({ kind: "VALIDATION_FAILED" }));
  });
});
