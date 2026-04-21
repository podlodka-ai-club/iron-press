import { describe, expect, it } from "vitest";
import { decide } from "../../src/planner/decide.js";
import { defaultFlags, makeIssue, stateFromIssues } from "./fixtures.js";

describe("planner.decide", () => {
  it("Agent Impl Todo → ba", () => {
    const impl = makeIssue({ id: "ENG-1", title: "Feature X - Agent Implementation", status: "Todo" });
    const { actions, blockers } = decide(stateFromIssues("ENG-1", [impl]), defaultFlags());
    expect(blockers).toHaveLength(0);
    expect(actions).toEqual([
      expect.objectContaining({ kind: "ba", issueId: "ENG-1" }),
    ]);
  });

  it("Agent Impl Agent Done, no children, no PO review → po", () => {
    const impl = makeIssue({
      id: "ENG-1",
      title: "Feature X - Agent Implementation",
      status: "Agent Done",
    });
    const { actions } = decide(stateFromIssues("ENG-1", [impl]), defaultFlags());
    expect(actions).toEqual([expect.objectContaining({ kind: "po", issueId: "ENG-1" })]);
  });

  it("Agent Impl Agent Done + PO review → tl", () => {
    const impl = makeIssue({
      id: "ENG-1",
      title: "Feature X - Agent Implementation",
      status: "Agent Done",
      comments: [
        {
          id: "c1",
          body: "## PO Approved\nlooks good",
          createdAt: "2026-04-10T00:00:00.000Z",
          authorType: "agent",
          isResolved: false,
        },
      ],
    });
    const { actions } = decide(stateFromIssues("ENG-1", [impl]), defaultFlags());
    expect(actions).toEqual([expect.objectContaining({ kind: "tl", issueId: "ENG-1" })]);
  });

  it("Agent Impl with Todo repo issues → code on parent", () => {
    const impl = makeIssue({
      id: "ENG-1",
      title: "Feature X - Agent Implementation",
      status: "Agent Done",
      childrenIds: ["ENG-2", "ENG-3"],
    });
    const be = makeIssue({ id: "ENG-2", title: "Feature X - Backend", status: "Todo", parentId: "ENG-1" });
    const fe = makeIssue({ id: "ENG-3", title: "Feature X - Frontend", status: "Todo", parentId: "ENG-1" });
    const { actions } = decide(stateFromIssues("ENG-1", [impl, be, fe]), defaultFlags());
    expect(actions).toEqual([expect.objectContaining({ kind: "code", issueId: "ENG-1" })]);
  });

  it("Agent Impl with repo children in flight → no action", () => {
    const impl = makeIssue({
      id: "ENG-1",
      title: "Feature X - Agent Implementation",
      status: "Agent Done",
      childrenIds: ["ENG-2"],
    });
    const be = makeIssue({ id: "ENG-2", title: "Feature X - Backend", status: "In Development", parentId: "ENG-1" });
    const { actions } = decide(stateFromIssues("ENG-1", [impl, be]), defaultFlags());
    expect(actions).toHaveLength(0);
  });

  it("Slice 0 - Empty → tl-design", () => {
    const slice = makeIssue({ id: "ENG-5", title: "Slice 0: Architecture - Empty", status: "Todo" });
    const { actions } = decide(stateFromIssues("ENG-5", [slice]), defaultFlags());
    expect(actions).toEqual([expect.objectContaining({ kind: "tl-design", issueId: "ENG-5" })]);
  });

  it("Slice 0 - Empty with design=brainstorm → tl-design-brainstorm", () => {
    const slice = makeIssue({ id: "ENG-5", title: "Slice 0: Architecture - Empty", status: "Todo" });
    const { actions } = decide(
      stateFromIssues("ENG-5", [slice]),
      defaultFlags({ design: "brainstorm" }),
    );
    expect(actions).toEqual([expect.objectContaining({ kind: "tl-design-brainstorm", issueId: "ENG-5" })]);
  });

  it("Slice 0 - Brainstorm + Agent Done → tl-design-finalize", () => {
    const slice = makeIssue({ id: "ENG-5", title: "Slice 0: Arch - Brainstorm", status: "Agent Done" });
    const { actions } = decide(stateFromIssues("ENG-5", [slice]), defaultFlags());
    expect(actions).toEqual([expect.objectContaining({ kind: "tl-design-finalize", issueId: "ENG-5" })]);
  });

  describe("Agent Blocked routing", () => {
    const questionComment = {
      id: "c1",
      body: "## Questions from BA\n1. Which scope should we use?",
      createdAt: "2026-04-10T00:00:00.000Z",
      authorType: "agent" as const,
      isResolved: false,
    };

    it("Agent Impl blocked + human reply → ba-check-comments", () => {
      const impl = makeIssue({
        id: "ENG-1",
        title: "Feature X - Agent Implementation",
        status: "Agent Blocked",
        comments: [
          questionComment,
          {
            id: "c2",
            body: "Per-user scoping please.",
            createdAt: "2026-04-11T00:00:00.000Z",
            authorType: "human",
            isResolved: false,
          },
        ],
      });
      const { actions } = decide(stateFromIssues("ENG-1", [impl]), defaultFlags());
      expect(actions).toEqual([
        expect.objectContaining({ kind: "ba-check-comments", issueId: "ENG-1" }),
      ]);
    });

    it("Agent Impl blocked + no reply + --lead=human → po (first review)", () => {
      const impl = makeIssue({
        id: "ENG-1",
        title: "Feature X - Agent Implementation",
        status: "Agent Blocked",
        comments: [questionComment],
      });
      const { actions, blockers } = decide(stateFromIssues("ENG-1", [impl]), defaultFlags());
      expect(blockers).toHaveLength(0);
      expect(actions).toEqual([expect.objectContaining({ kind: "po", issueId: "ENG-1" })]);
    });

    it("Slices Parent blocked + no reply + --lead=human → blocker (no auto-PO)", () => {
      const sp = makeIssue({
        id: "ENG-9",
        title: "Feature - Slices",
        status: "Agent Blocked",
        comments: [questionComment],
      });
      const { actions, blockers } = decide(stateFromIssues("ENG-9", [sp]), defaultFlags());
      expect(actions).toHaveLength(0);
      expect(blockers).toEqual([
        expect.objectContaining({ issueId: "ENG-9", kind: "awaiting-human-answer-ba" }),
      ]);
    });

    it("Slices Parent blocked + no reply + --lead=po → po auto-dispatch", () => {
      const sp = makeIssue({
        id: "ENG-9",
        title: "Feature - Slices",
        status: "Agent Blocked",
        comments: [questionComment],
      });
      const state = stateFromIssues("ENG-9", [sp], { poAutoRemaining: 3 });
      const { actions, blockers } = decide(state, defaultFlags({ lead: "po" }));
      expect(blockers).toHaveLength(0);
      expect(actions).toEqual([expect.objectContaining({ kind: "po", issueId: "ENG-9" })]);
    });

    it("BA blocked, sensitive keyword, --lead=po → still blocks on human", () => {
      const sp = makeIssue({
        id: "ENG-9",
        title: "Feature - Slices",
        status: "Agent Blocked",
        comments: [
          {
            ...questionComment,
            body: "## Questions from BA\n1. How do we handle billing + invoice refunds here?",
          },
        ],
      });
      const state = stateFromIssues("ENG-9", [sp], { poAutoRemaining: 3 });
      const { actions, blockers } = decide(state, defaultFlags({ lead: "po" }));
      expect(actions).toHaveLength(0);
      expect(blockers).toEqual([
        expect.objectContaining({ kind: "awaiting-human-answer-ba" }),
      ]);
    });

    it("PO auto-budget exhausted, --lead=po → blocks on human", () => {
      const sp = makeIssue({
        id: "ENG-9",
        title: "Feature - Slices",
        status: "Agent Blocked",
        comments: [questionComment],
      });
      const state = stateFromIssues("ENG-9", [sp], { poAutoRemaining: 0 });
      const { actions, blockers } = decide(state, defaultFlags({ lead: "po" }));
      expect(actions).toHaveLength(0);
      expect(blockers).toEqual([
        expect.objectContaining({ kind: "awaiting-human-after-po-auto" }),
      ]);
    });

    it("TL questions on Repo Issue always block on human, regardless of --lead", () => {
      const impl = makeIssue({
        id: "ENG-1",
        title: "F - Agent Implementation",
        status: "Agent Done",
        childrenIds: ["ENG-2"],
      });
      const repo = makeIssue({
        id: "ENG-2",
        title: "F - Backend",
        status: "Agent Blocked",
        parentId: "ENG-1",
        comments: [
          {
            id: "c1",
            body: "## Questions from Tech Lead\n1. Which DB index?",
            createdAt: "2026-04-10T00:00:00.000Z",
            authorType: "agent",
            isResolved: false,
          },
        ],
      });
      const state = stateFromIssues("ENG-1", [impl, repo]);
      const human = decide(state, defaultFlags());
      const po = decide({ ...state, poAutoRemaining: 3 }, defaultFlags({ lead: "po" }));
      expect(human.actions).toHaveLength(0);
      expect(human.blockers).toEqual([
        expect.objectContaining({ kind: "awaiting-human-answer-tl", issueId: "ENG-2" }),
      ]);
      expect(po.actions).toHaveLength(0);
      expect(po.blockers).toEqual([
        expect.objectContaining({ kind: "awaiting-human-answer-tl" }),
      ]);
    });

    it("Slice 0 - Brainstorm blocked awaits human design choice (both modes)", () => {
      const slice = makeIssue({
        id: "ENG-5",
        title: "Slice 0: Arch - Brainstorm",
        status: "Agent Blocked",
        comments: [
          {
            id: "c1",
            body: "## Questions from Tech Lead\nWhich approach?",
            createdAt: "2026-04-10T00:00:00.000Z",
            authorType: "agent",
            isResolved: false,
          },
        ],
      });
      const human = decide(stateFromIssues("ENG-5", [slice]), defaultFlags({ design: "brainstorm" }));
      const po = decide(
        stateFromIssues("ENG-5", [slice], { poAutoRemaining: 3 }),
        defaultFlags({ design: "brainstorm", lead: "po" }),
      );
      for (const r of [human, po]) {
        expect(r.actions).toHaveLength(0);
        expect(r.blockers).toEqual([
          expect.objectContaining({ kind: "awaiting-human-design-choice", issueId: "ENG-5" }),
        ]);
      }
    });
  });

  it("--no-code prevents code dispatch even when repo issues are Todo", () => {
    const impl = makeIssue({
      id: "ENG-1",
      title: "F - Agent Implementation",
      status: "Agent Done",
      childrenIds: ["ENG-2"],
    });
    const be = makeIssue({ id: "ENG-2", title: "F - Backend", status: "Todo", parentId: "ENG-1" });
    const { actions } = decide(stateFromIssues("ENG-1", [impl, be]), defaultFlags({ noCode: true }));
    expect(actions).toHaveLength(0);
  });

  it("dedupes multiple Todo repo issues to one /code", () => {
    const impl = makeIssue({
      id: "ENG-1",
      title: "F - Agent Implementation",
      status: "Agent Done",
      childrenIds: ["ENG-2", "ENG-3"],
    });
    const be = makeIssue({ id: "ENG-2", title: "F - Backend", status: "Todo", parentId: "ENG-1" });
    const fe = makeIssue({ id: "ENG-3", title: "F - Frontend", status: "Todo", parentId: "ENG-1" });
    const { actions } = decide(stateFromIssues("ENG-1", [impl, be, fe]), defaultFlags());
    // Only one /code action for the parent; dedupe happens at orchestrator level but evaluateRepoIssues already returns one
    const codeActions = actions.filter((a) => a.kind === "code");
    expect(codeActions).toHaveLength(1);
    expect(codeActions[0]?.issueId).toBe("ENG-1");
  });

  it("terminal tree → empty actions and empty blockers", () => {
    const impl = makeIssue({
      id: "ENG-1",
      title: "F - Agent Implementation",
      status: "Done",
      childrenIds: ["ENG-2"],
    });
    const be = makeIssue({ id: "ENG-2", title: "F - Backend", status: "Done", parentId: "ENG-1" });
    const { actions, blockers } = decide(stateFromIssues("ENG-1", [impl, be]), defaultFlags());
    expect(actions).toHaveLength(0);
    expect(blockers).toHaveLength(0);
  });
});
