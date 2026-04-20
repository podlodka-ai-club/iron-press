import { fetchJson } from "../api.js";
import {
  escapeHtml,
  fmtDuration,
  fmtUsd,
  relativeTime,
  roleChip,
  roleLabel,
  statusPill,
} from "../util.js";

let refreshTimer;
let allRuns = [];
let filter = "";

export async function render(root) {
  stop();
  root.innerHTML = `<div class="loading">Loading runs…</div>`;
  try {
    allRuns = await fetchJson("/api/runs");
  } catch (err) {
    root.innerHTML = `<div class="empty">Failed to load runs: ${escapeHtml(err.message)}</div>`;
    return;
  }
  draw(root);
  wireSearch(root);
  // Auto-refresh every 2s; cheap — one fetch of meta summaries
  refreshTimer = setInterval(() => softRefresh(root), 2000);
}

export function stop() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  const search = document.getElementById("search");
  if (search) search.value = "";
}

async function softRefresh(root) {
  try {
    const next = await fetchJson("/api/runs");
    // Only redraw if content actually changed
    if (JSON.stringify(next) !== JSON.stringify(allRuns)) {
      allRuns = next;
      draw(root);
    }
  } catch {
    /* ignore transient errors */
  }
}

function draw(root) {
  const filtered = applyFilter(allRuns, filter);
  const subtitle = document.getElementById("subtitle");
  if (subtitle) subtitle.textContent = `${allRuns.length} runs`;

  if (allRuns.length === 0) {
    root.innerHTML = `<div class="empty">No runs yet. Start one with <code>pnpm orchestrate &lt;id&gt;</code>.</div>`;
    return;
  }

  const cards = filtered.map(cardHtml).join("") ||
    `<div class="empty">No runs match “${escapeHtml(filter)}”.</div>`;
  root.innerHTML = `<div class="runs-grid">${cards}</div>`;

  for (const el of root.querySelectorAll(".run-card")) {
    const id = el.dataset.runId;
    el.addEventListener("click", () => {
      history.pushState({}, "", `/runs/${id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
  }
}

function wireSearch(root) {
  const search = document.getElementById("search");
  if (!search) return;
  search.oninput = () => {
    filter = search.value.trim().toLowerCase();
    draw(root);
  };
  search.focus();
}

function applyFilter(runs, q) {
  if (!q) return runs;
  return runs.filter(
    (r) =>
      r.runId.toLowerCase().includes(q) ||
      (r.rootInput ?? "").toLowerCase().includes(q) ||
      (r.rootTitle ?? "").toLowerCase().includes(q) ||
      (r.stageKinds ?? []).some((k) => k.toLowerCase().includes(q)),
  );
}

function cardHtml(r) {
  const chips = (r.stageKinds ?? []).slice(0, 6).map(roleChip).join(" ");
  const more = (r.stageKinds ?? []).length > 6 ? ` <span class="chip">+${r.stageKinds.length - 6}</span>` : "";
  const leadBadge = r.flags?.lead === "po" ? `<span class="chip">lead=po</span>` : "";
  const designBadge =
    r.flags?.design === "brainstorm" ? `<span class="chip">design=brainstorm</span>` : "";
  const baBadge = r.flags?.ba === "slice" ? `<span class="chip">ba=slice</span>` : "";
  const duration = r.durationMs ? fmtDuration(r.durationMs) : "—";

  const title = r.rootTitle
    ? `<div class="run-card-title" title="${escapeHtml(r.rootTitle)}">${escapeHtml(r.rootTitle)}</div>`
    : "";

  // Live indicator for running stages — replaces the usual chip row so the
  // card makes the current work obvious at a glance.
  let currentBlock = "";
  if (r.status === "running" && r.currentStage) {
    const cs = r.currentStage;
    currentBlock = `
      <div class="run-card-current">
        <span class="spinner" aria-hidden="true"></span>
        <span class="run-card-current-label">${escapeHtml(roleLabel(cs.kind))}</span>
        <span class="run-card-current-issue">${escapeHtml(cs.issueId)}</span>
        ${
          cs.issueTitle
            ? `<span class="run-card-current-title" title="${escapeHtml(cs.issueTitle)}">${escapeHtml(cs.issueTitle)}</span>`
            : ""
        }
      </div>
    `;
  }

  return `
    <article class="run-card" data-run-id="${escapeHtml(r.runId)}">
      <div class="run-card-head">
        <div class="run-card-heading">
          <div class="run-card-root">${escapeHtml(r.rootInput ?? "(unknown)")}</div>
          ${title}
          <div class="run-card-id" title="${escapeHtml(r.runId)}">${escapeHtml(r.runId)}</div>
        </div>
        ${statusPill(r.status)}
      </div>
      ${currentBlock}
      <div class="run-card-chips">${chips}${more} ${leadBadge} ${designBadge} ${baBadge}</div>
      <div class="run-card-footer">
        <span>${r.stageCount} ${r.stageCount === 1 ? "stage" : "stages"} · ${duration}</span>
        <span class="cost">${fmtUsd(r.totalCostUsd)}</span>
      </div>
      <div class="run-card-footer">
        <span class="run-card-time">${escapeHtml(relativeTime(r.startedAt))}</span>
      </div>
    </article>
  `;
}
