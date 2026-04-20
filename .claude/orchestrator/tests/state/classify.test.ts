import { describe, expect, it } from "vitest";
import {
  classifyIssue,
  findLatestQuestionThread,
  hasHumanReplyAfter,
  hasPoReviewComment,
  repoLabelFromTitle,
  sliceNumberFromTitle,
  containsSensitiveKeyword,
} from "../../src/state/classify.js";
import { makeIssue } from "../planner/fixtures.js";

describe("classify", () => {
  it("classifies Agent Implementation", () => {
    const i = makeIssue({ id: "ENG-1", title: "Foo - Agent Implementation", status: "Todo" });
    expect(classifyIssue(i, { "ENG-1": i })).toBe("AgentImplementation");
  });

  it("classifies Slices Parent", () => {
    const i = makeIssue({ id: "ENG-1", title: "Foo - Slices", status: "Todo" });
    expect(classifyIssue(i, { "ENG-1": i })).toBe("SlicesParent");
  });

  it("classifies Slice", () => {
    const i = makeIssue({ id: "ENG-1", title: "Slice 0: Arch - Empty", status: "Todo" });
    expect(classifyIssue(i, { "ENG-1": i })).toBe("Slice");
  });

  it("classifies Repo Issue by parent title", () => {
    const parent = makeIssue({ id: "ENG-1", title: "Foo - Agent Implementation", status: "Todo" });
    const child = makeIssue({ id: "ENG-2", title: "Foo - Backend", status: "Todo", parentId: "ENG-1" });
    expect(classifyIssue(child, { "ENG-1": parent, "ENG-2": child })).toBe("RepoIssue");
  });

  it("falls back to FeatureIssue", () => {
    const i = makeIssue({ id: "ENG-1", title: "Anything else", status: "Todo" });
    expect(classifyIssue(i, { "ENG-1": i })).toBe("FeatureIssue");
  });

  it("repoLabelFromTitle", () => {
    expect(repoLabelFromTitle("Foo - Backend")).toBe("Backend");
    expect(repoLabelFromTitle("Foo - Frontend")).toBe("Frontend");
    expect(repoLabelFromTitle("No label")).toBeNull();
  });

  it("sliceNumberFromTitle", () => {
    expect(sliceNumberFromTitle("Slice 0: Arch - Empty")).toBe(0);
    expect(sliceNumberFromTitle("Slice 12: Foo")).toBe(12);
    expect(sliceNumberFromTitle("Not a slice")).toBeNull();
  });
});

describe("comments helpers", () => {
  const question = {
    id: "c1",
    body: "## Questions from BA\n\nClarify scoping.",
    createdAt: "2026-04-01T00:00:00.000Z",
    authorType: "agent" as const,
    isResolved: false,
  };

  it("finds latest question thread with askedBy", () => {
    const thread = findLatestQuestionThread([question]);
    expect(thread?.askedBy).toBe("BA");
  });

  it("picks TL thread when author is Tech Lead", () => {
    const thread = findLatestQuestionThread([
      { ...question, id: "c1", body: "## Questions from BA\n…" },
      {
        id: "c2",
        body: "## Questions from Tech Lead\n…",
        createdAt: "2026-04-02T00:00:00.000Z",
        authorType: "agent",
        isResolved: false,
      },
    ]);
    expect(thread?.askedBy).toBe("TL");
  });

  it("hasHumanReplyAfter — positive", () => {
    const thread = findLatestQuestionThread([question])!;
    const hasReply = hasHumanReplyAfter(thread, [
      question,
      {
        id: "c2",
        body: "yes please",
        createdAt: "2026-04-02T00:00:00.000Z",
        authorType: "human",
        isResolved: false,
      },
    ]);
    expect(hasReply).toBe(true);
  });

  it("hasHumanReplyAfter — only agent reply", () => {
    const thread = findLatestQuestionThread([question])!;
    const hasReply = hasHumanReplyAfter(thread, [
      question,
      {
        id: "c2",
        body: "some agent-generated followup",
        createdAt: "2026-04-02T00:00:00.000Z",
        authorType: "agent",
        isResolved: false,
      },
    ]);
    expect(hasReply).toBe(false);
  });

  it("hasPoReviewComment", () => {
    expect(
      hasPoReviewComment([
        {
          id: "c1",
          body: "## PO Approved\ngo",
          createdAt: "2026-04-10T00:00:00.000Z",
          authorType: "agent",
          isResolved: false,
        },
      ]),
    ).toBe(true);
    expect(hasPoReviewComment([])).toBe(false);
  });

  it("containsSensitiveKeyword matches case-insensitively", () => {
    expect(containsSensitiveKeyword("Involves Billing and GDPR handling", ["billing", "gdpr"])).toBe(true);
    expect(containsSensitiveKeyword("Nothing sensitive", ["billing"])).toBe(false);
  });
});
