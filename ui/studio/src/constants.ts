import type { NodeStatus } from "./types.js";

// ─── ROLE COLORS ────────────────────────────────────────────────────────────
// FIXME[api-config]: hardcoded — fetch from GET /api/studio/config instead

export const ROLE_COLORS: Record<string, string> = {
  "business-analyst": "#e3b341",
  engineer: "#f0883e",
  "tech-lead": "#388bfd",
  "product-owner": "#a371f7",
  "pull-request": "#3fb950",
  human: "#ff7b72",
  "worktree-script": "#8957e5",
};

export const ROLE_COLOR_FALLBACK = "#8b949e";

// ─── STATUS COLORS ──────────────────────────────────────────────────────────
// FIXME[api-config]: hardcoded — fetch from GET /api/studio/config instead

export const STATUS_COLORS: Record<NodeStatus, string> = {
  Pass: "#3fb950",
  Fail: "#f85149",
  WaitUserInput: "#8b949e",
};

export const STATUS_COLOR_FALLBACK = "#a0aec0";

// ─── NODE DIMENSIONS ────────────────────────────────────────────────────────

// Actual rendered CSS width in AgentNode. Intentionally wider than NODE_LAYOUT_WIDTH
// so nodes have breathing room in the dagre layout.
export const NODE_RENDER_WIDTH = 240;

// Width and height dagre uses when computing graph positions. Keeping these
// slightly smaller than the rendered size gives natural padding between nodes.
export const NODE_LAYOUT_WIDTH = 220;
export const NODE_LAYOUT_HEIGHT = 120;

// ─── HANDLE GEOMETRY ────────────────────────────────────────────────────────

export const HANDLE_SIZE = 14;
export const HANDLE_HALF = 7; // offset to center the handle on the node border

// ─── DROP OFFSETS ───────────────────────────────────────────────────────────

// When dragging from the library, subtract half the node width and a bit of
// vertical padding so the node appears centered under the cursor.
export const DROP_OFFSET_X = 110;
export const DROP_OFFSET_Y = 60;

// Horizontal stagger when a template drops multiple nodes at once.
export const TEMPLATE_DROP_X_STEP = 240;
