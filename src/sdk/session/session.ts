import { createHash } from "node:crypto";

// =============================================================================
// Session id helpers — stable UUIDv5 per (run, role, issue) so resume works.
// The SDK validates that sessionId is a UUID; a deterministic UUIDv5 gives us
// both properties (valid + reproducible).
// =============================================================================

// Fixed namespace UUID for the orchestrator (randomly chosen once).
const ORCH_NAMESPACE = "6b7ae4e2-7a91-4cf1-9a1d-4ab3e2a1c000";

/**
 * Build a unique session id per stage dispatch.
 *
 * The SDK refuses to reuse a session id, and the same (role, issueId) may be
 * dispatched multiple times within one run. We mix the stage index into the
 * hash so every dispatch gets its own UUID while remaining deterministic per
 * stage slot (so `--resume` can re-derive ids).
 */
export function stableSessionId(
  role: string,
  issueId: string,
  runId: string,
  stageIndex?: number,
): string {
  const suffix = stageIndex === undefined ? "" : `::${stageIndex}`;
  return uuidV5(`${runId}::${role}::${issueId}${suffix}`.toLowerCase(), ORCH_NAMESPACE);
}

function uuidV5(name: string, namespace: string): string {
  const nsBytes = parseUuid(namespace);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1").update(Buffer.concat([nsBytes, nameBytes])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // Set version (5) and variant (RFC 4122)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}
