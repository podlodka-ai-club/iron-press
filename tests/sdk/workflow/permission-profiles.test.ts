import { afterEach, describe, expect, it } from "vitest";
import { PERMISSION_PROFILES, resolvePermissionProfile } from "@/sdk/workflow/permission-profiles";

afterEach(() => {
  delete process.env.ORCH_OVER_BUDGET;
});

// ---------------------------------------------------------------------------
// resolvePermissionProfile
// ---------------------------------------------------------------------------

describe("resolvePermissionProfile", () => {
  it("throws for an unknown profile name", () => {
    expect(() => resolvePermissionProfile("nonexistent")).toThrow(
      /Unknown permission profile "nonexistent"/,
    );
  });

  it.each(Object.keys(PERMISSION_PROFILES))("returns a function for known profile '%s'", (name) => {
    expect(typeof resolvePermissionProfile(name)).toBe("function");
  });

  it("view-only and read-only are aliased to the same function", () => {
    expect(resolvePermissionProfile("view-only")).toBe(resolvePermissionProfile("read-only"));
  });

  it("safe-write and engineer are aliased to the same function", () => {
    expect(resolvePermissionProfile("safe-write")).toBe(resolvePermissionProfile("engineer"));
  });
});

// ---------------------------------------------------------------------------
// view-only profile
// ---------------------------------------------------------------------------

describe("view-only profile", () => {
  const profile = PERMISSION_PROFILES["view-only"]!;

  it.each(["Edit", "Write", "NotebookEdit", "Bash"])("denies %s unconditionally", async (toolName) => {
    const r = await profile(toolName, {});
    expect(r.behavior).toBe("deny");
  });

  it.each(["Read", "Glob", "Grep"])("allows read-only tool %s", async (toolName) => {
    const r = await profile(toolName, {});
    expect(r.behavior).toBe("allow");
  });

  it("denies allowed tools when ORCH_OVER_BUDGET=1", async () => {
    process.env.ORCH_OVER_BUDGET = "1";
    const r = await profile("Read", { file_path: "/any/file" });
    expect(r.behavior).toBe("deny");
  });

  it("allows normally when ORCH_OVER_BUDGET is unset", async () => {
    delete process.env.ORCH_OVER_BUDGET;
    const r = await profile("Read", { file_path: "/any/file" });
    expect(r.behavior).toBe("allow");
  });

  it("allows normally when ORCH_OVER_BUDGET is not '1'", async () => {
    process.env.ORCH_OVER_BUDGET = "0";
    const r = await profile("Read", { file_path: "/any/file" });
    expect(r.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// safe-write profile — file path checks
// ---------------------------------------------------------------------------

describe("safe-write profile — Edit / Write / NotebookEdit", () => {
  const profile = PERMISSION_PROFILES["safe-write"]!;

  it("allows Edit to an unrestricted path", async () => {
    const r = await profile("Edit", { file_path: "/home/user/project/src/index.ts" });
    expect(r.behavior).toBe("allow");
  });

  it.each([
    ["/etc/passwd"],
    ["/var/log/auth.log"],
    ["/root/.ssh/id_rsa"],
    ["/usr/bin/python3"],
    ["/boot/grub.cfg"],
  ])("denies Edit to forbidden path '%s'", async (filePath) => {
    const r = await profile("Edit", { file_path: filePath });
    expect(r.behavior).toBe("deny");
  });

  it("denies Write when file_path key is missing entirely", async () => {
    const r = await profile("Write", {});
    expect(r.behavior).toBe("deny");
  });

  it("reads 'path' field when 'file_path' is absent", async () => {
    const r = await profile("Write", { path: "/etc/shadow" });
    expect(r.behavior).toBe("deny");
  });

  it("reads 'notebookPath' for NotebookEdit", async () => {
    const r = await profile("NotebookEdit", { notebookPath: "/etc/notebook.ipynb" });
    expect(r.behavior).toBe("deny");
  });

  it("allows NotebookEdit to a safe path", async () => {
    const r = await profile("NotebookEdit", { notebookPath: "/home/user/analysis.ipynb" });
    expect(r.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// safe-write profile — Bash command blocking
// ---------------------------------------------------------------------------

describe("safe-write profile — Bash", () => {
  const profile = PERMISSION_PROFILES["safe-write"]!;

  it("allows a safe bash command", async () => {
    const r = await profile("Bash", { command: "npm test" });
    expect(r.behavior).toBe("allow");
  });

  it("allows git push without --force flag", async () => {
    const r = await profile("Bash", { command: "git push origin feature-branch" });
    expect(r.behavior).toBe("allow");
  });

  it.each([
    ["rm -rf /tmp/data",                "rm -rf /"],
    ["git push origin main --force",    "git push --force"],
    ["git push origin main -f",         "git push -f"],
    ["git reset --hard origin/main",    "git reset --hard origin/"],
    ["a:() { :|:& }; :",                 "fork bomb"],
    ["mkfs.ext4 /dev/sda1",             "mkfs"],
    ["dd if=/dev/zero of=/dev/sda",     "dd to /dev"],
  ])("denies '%s' (%s)", async (command) => {
    const r = await profile("Bash", { command });
    expect(r.behavior).toBe("deny");
  });

  it("handles missing command field gracefully (empty treated as safe)", async () => {
    const r = await profile("Bash", {});
    expect(r.behavior).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// safe-write profile — budget gate
// ---------------------------------------------------------------------------

describe("safe-write profile — budget gate", () => {
  const profile = PERMISSION_PROFILES["safe-write"]!;

  it("denies all tools when ORCH_OVER_BUDGET=1", async () => {
    process.env.ORCH_OVER_BUDGET = "1";
    const r = await profile("Bash", { command: "echo hello" });
    expect(r.behavior).toBe("deny");
  });

  it("allows normally when ORCH_OVER_BUDGET is unset", async () => {
    delete process.env.ORCH_OVER_BUDGET;
    const r = await profile("Bash", { command: "echo hello" });
    expect(r.behavior).toBe("allow");
  });
});
