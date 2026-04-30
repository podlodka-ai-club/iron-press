import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

vi.mock("node:child_process");
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(), mkdirSync: vi.fn() };
});

import { prepareRepository } from "@/git/repo-manager";

const SAMPLE_SSH_URL = "git@github.com:owner/my-repo.git";
const SAMPLE_HTTPS_URL = "https://github.com/owner/my-repo.git";
const CUSTOM_DIR = "/custom/clone/dir";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the argv array passed to the nth execFileSync call (0-indexed). */
function execArgs(callIndex = 0): string[] {
  return vi.mocked(execFileSync).mock.calls[callIndex]![1] as string[];
}

/** Return the options object passed to the nth execFileSync call (0-indexed). */
function execOpts(callIndex = 0): Record<string, unknown> {
  return vi.mocked(execFileSync).mock.calls[callIndex]![2] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("prepareRepository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mkdirSync).mockReturnValue(undefined as never);
    vi.mocked(execFileSync).mockReturnValue(Buffer.from("") as never);
  });

  // -------------------------------------------------------------------------
  // Update path (.git directory exists)
  // -------------------------------------------------------------------------

  describe("when the .git directory already exists", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
    });

    it("does not call git clone", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      const cloneCalled = vi.mocked(execFileSync).mock.calls.some(
        ([_file, args]) => (args as string[])[0] === "clone",
      );
      expect(cloneCalled).toBe(false);
    });

    it("fetches from origin", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execArgs(0)).toEqual(["fetch", "origin"]);
    });

    it("passes stdio:pipe on fetch", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execOpts(0)).toMatchObject({ stdio: "pipe" });
    });

    it("checks out the default branch (main)", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execArgs(1)).toEqual(["checkout", "main"]);
    });

    it("checks out a custom baseBranch", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR, baseBranch: "develop" });
      expect(execArgs(1)).toEqual(["checkout", "develop"]);
    });

    it("pulls with rebase on the default branch", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execArgs(2)).toEqual(["pull", "origin", "main", "--rebase"]);
    });

    it("pulls with rebase using a custom baseBranch", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR, baseBranch: "release" });
      expect(execArgs(2)).toEqual(["pull", "origin", "release", "--rebase"]);
    });

    it("passes targetDir as cwd for all git commands", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execOpts(0)).toMatchObject({ cwd: CUSTOM_DIR });
      expect(execOpts(1)).toMatchObject({ cwd: CUSTOM_DIR });
      expect(execOpts(2)).toMatchObject({ cwd: CUSTOM_DIR });
    });

    it("issues exactly 3 execFileSync calls", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execFileSync).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // Clone path (.git directory does not exist)
  // -------------------------------------------------------------------------

  describe("when the .git directory does not exist", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
    });

    it("calls git clone with the URL and target directory", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execArgs(0)).toEqual(["clone", SAMPLE_SSH_URL, CUSTOM_DIR]);
    });

    it("passes stdio:pipe on clone", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execOpts(0)).toMatchObject({ stdio: "pipe" });
    });

    it("creates the parent directory before cloning", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(mkdirSync).toHaveBeenCalledWith(
        path.dirname(CUSTOM_DIR),
        expect.objectContaining({ recursive: true }),
      );
    });

    it("issues exactly 1 execFileSync call", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      expect(execFileSync).toHaveBeenCalledTimes(1);
    });

    it("does not call fetch, checkout, or pull", () => {
      prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
      const calls = vi.mocked(execFileSync).mock.calls.map(([_file, args]) => args as string[]);
      expect(calls.every((args) => args[0] === "clone")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Repo name extraction and default cloneDir
  // -------------------------------------------------------------------------

  describe("repo name extraction", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
    });

    it("extracts the repo name from an SSH URL (strips .git suffix)", () => {
      prepareRepository({ url: SAMPLE_SSH_URL });
      expect(execArgs(0)[2]).toContain("my-repo");
    });

    it("extracts the repo name from an HTTPS URL", () => {
      prepareRepository({ url: SAMPLE_HTTPS_URL });
      expect(execArgs(0)[2]).toContain("my-repo");
    });

    it("extracts the repo name from a URL without .git suffix", () => {
      prepareRepository({ url: "https://github.com/owner/no-extension" });
      expect(execArgs(0)[2]).toContain("no-extension");
    });
  });

  // -------------------------------------------------------------------------
  // Return value
  // -------------------------------------------------------------------------

  it("returns the custom cloneDir when provided", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = prepareRepository({ url: SAMPLE_SSH_URL, cloneDir: CUSTOM_DIR });
    expect(result).toBe(CUSTOM_DIR);
  });

  it("returns a path containing the repo name when cloneDir is omitted", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = prepareRepository({ url: SAMPLE_SSH_URL });
    expect(result).toContain("my-repo");
  });
});
