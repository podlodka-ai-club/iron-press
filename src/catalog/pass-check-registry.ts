import type { NodeContext, NodePassCheck } from "@/sdk/workflow";

export type PassCheckFn = (
  ctx: NodeContext<{ issueId: string; runId: string }>,
) => Promise<NodePassCheck>;

interface PassCheckEntry {
  fn: PassCheckFn;
  description: string;
}

const PASS_CHECK_REGISTRY: Record<string, PassCheckEntry> = {};

export function registerPassCheck(key: string, fn: PassCheckFn, description: string): void {
  PASS_CHECK_REGISTRY[key] = { fn, description };
}

export function resolvePassCheck(key: string): PassCheckFn | undefined {
  return PASS_CHECK_REGISTRY[key]?.fn;
}

export function registeredPassChecks(): Array<{ key: string; description: string }> {
  return Object.entries(PASS_CHECK_REGISTRY).map(([key, entry]) => ({
    key,
    description: entry.description,
  }));
}

export function registeredPassCheckKeys(): string[] {
  return Object.keys(PASS_CHECK_REGISTRY);
}
