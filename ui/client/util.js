// Small helpers — shared across views.

export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Tagged-template helper for safe HTML with interpolated strings escaped. */
export function html(strings, ...values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) out += v.join("");
      else if (v instanceof SafeHtml) out += v.value;
      else out += escapeHtml(v);
    }
  }
  return out;
}

export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
}
export const raw = (s) => new SafeHtml(s);

export function fmtUsd(n) {
  if (!Number.isFinite(n)) return "$0.00";
  return "$" + Number(n).toFixed(2);
}

export function fmtTokens(n) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mRem = m % 60;
  return mRem ? `${h}h ${mRem}m` : `${h}h`;
}

export function relativeTime(iso) {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? "ago" : "from now";
  if (abs < 60_000) return `just now`;
  const m = Math.round(abs / 60_000);
  if (m < 60) return `${m} min ${sign}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ${sign}`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ${sign}`;
  const mo = Math.round(d / 30);
  return `${mo}mo ${sign}`;
}

export function absoluteTime(iso) {
  if (!iso) return "";
  const t = new Date(iso);
  return t.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortTime(iso) {
  if (!iso) return "";
  const t = new Date(iso);
  return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Agent-color mirror — matches .claude/agents/*.md frontmatter `color` values.
// check-comments stages inherit their owning role's color.
export function roleColour(kind) {
  if (!kind) return "gray";
  if (kind === "ba" || kind === "ba-slice" || kind === "ba-check-comments") return "yellow";
  if (kind === "po") return "purple";
  if (kind.startsWith("tl")) return "blue";
  if (kind === "code") return "orange";
  if (kind === "dev-backend") return "pink";
  if (kind === "dev-frontend") return "cyan";
  if (kind === "pm") return "green";
  return "gray";
}

export function roleLabel(kind) {
  // Friendly labels for the chip text
  const map = {
    ba: "BA",
    "ba-slice": "BA slice",
    "ba-check-comments": "BA check",
    po: "PO",
    tl: "TL",
    "tl-design": "TL design",
    "tl-design-brainstorm": "TL brainstorm",
    "tl-design-finalize": "TL finalize",
    "tl-check-comments": "TL check",
    code: "code",
    "dev-backend": "Rails backend",
    "dev-frontend": "React frontend",
    pm: "PM",
  };
  return map[kind] ?? kind ?? "";
}

export function statusPill(status) {
  const s = (status || "unknown").toLowerCase();
  return `<span class="pill ${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

export function roleChip(kind) {
  const color = roleColour(kind);
  return `<span class="chip role-${color}" title="${escapeHtml(kind)}">${escapeHtml(roleLabel(kind))}</span>`;
}

// Tiny toast
const toastEl = () => document.getElementById("toast");
let toastTimer;
export function toast(msg, ms = 3000) {
  const el = toastEl();
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}
