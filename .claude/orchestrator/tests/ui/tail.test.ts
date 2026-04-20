import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { tailFile } from "../../ui/tail.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "orch-tail-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("tailFile", () => {
  it("emits backlog and subsequent appends", async () => {
    const file = path.join(dir, "log.ndjson");
    writeFileSync(file, "a\nb\n");

    const received: string[] = [];
    const unsubscribe = tailFile(file, (lines) => received.push(...lines), { pollIntervalMs: 50 });

    await sleep(80);
    expect(received).toEqual(["a", "b"]);

    appendFileSync(file, "c\n");
    await sleep(200);
    expect(received).toEqual(["a", "b", "c"]);

    appendFileSync(file, "d\ne\n");
    await sleep(200);
    expect(received).toEqual(["a", "b", "c", "d", "e"]);

    unsubscribe();
  });

  it("handles file created after subscription", async () => {
    const file = path.join(dir, "late.ndjson");
    const received: string[] = [];
    const unsubscribe = tailFile(file, (lines) => received.push(...lines), { pollIntervalMs: 50 });
    await sleep(80);
    expect(received).toEqual([]);

    writeFileSync(file, "first\n");
    await sleep(200);
    expect(received).toContain("first");

    unsubscribe();
  });

  it("does not re-emit backlog when includeBacklog=false", async () => {
    const file = path.join(dir, "nob.ndjson");
    writeFileSync(file, "old1\nold2\n");

    const received: string[] = [];
    const unsubscribe = tailFile(file, (lines) => received.push(...lines), {
      pollIntervalMs: 50,
      includeBacklog: false,
    });
    await sleep(80);
    expect(received).toEqual([]);

    appendFileSync(file, "new\n");
    await sleep(200);
    expect(received).toEqual(["new"]);

    unsubscribe();
  });
});
