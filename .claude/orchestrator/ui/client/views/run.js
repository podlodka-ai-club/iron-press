import { fetchJson, openSse } from "../api.js";
import {
  escapeHtml,
  fmtDuration,
  fmtTokens,
  fmtUsd,
  relativeTime,
  roleChip,
  shortTime,
  statusPill,
} from "../util.js";
import { openStage, closeStage } from "./stage.js";

let run;
let closeEvents;
let eventsBuffer = [];

export async function render(root, runId) {
  stop();
  root.innerHTML = `<div class="loading">Loading run ${escapeHtml(runId)}…</div>`;
  try {
    run = await fetchJson(`/api/runs/${encodeURIComponent(runId)}`);
  } catch (err) {
    root.innerHTML = `<div class="empty">Failed to load run: ${escapeHtml(err.message)}</div>
      <p style="text-align:center;"><a href="/" data-nav>← back to runs</a></p>`;
    return;
  }

  eventsBuffer = run.events.slice();
  const subtitle = document.getElementById("subtitle");
  if (subtitle) subtitle.textContent = `${run.runId} · ${run.status}`;

  draw(root);
  wireDom(root);

  // Live updates
  closeEvents = openSse(`/api/runs/${encodeURIComponent(runId)}/events`, {
    event: (e) => {
      eventsBuffer.push(e);
      updateEvents(root);
    },
    snapshot: (s) => {
      if (!s) return;
      // Merge in fresh stage summaries (preserving ordering)
      if (Array.isArray(s.stages)) run.stages = s.stages;
      if (typeof s.status === "string") run.status = s.status;
      updateStages(root);
      updateHeader(root);
    },
    ping: () => {},
    error: () => {},
  });

  // Open stage drawer if URL has ?stage=
  const params = new URLSearchParams(location.search);
  const stageSlug = params.get("stage");
  if (stageSlug) openStage(runId, stageSlug);
}

export function stop() {
  if (closeEvents) {
    closeEvents();
    closeEvents = undefined;
  }
  closeStage();
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

function rootTitle() {
  const state = run.state ?? {};
  const issues = state.issues ?? {};
  const rootInput = run.meta?.rootInput;
  return rootInput && issues[rootInput]?.title ? issues[rootInput].title : "";
}

function draw(root) {
  const title = rootTitle();
  const titleLine = title
    ? `<div class="run-header-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>`
    : "";
  root.innerHTML = `
    <div class="run-header">
      <div class="run-header-left">
        <h1>${escapeHtml(run.rootInput)} <span style="color:var(--muted); font-size:14px; margin-left:8px;">${escapeHtml(run.runId)}</span></h1>
        ${titleLine}
        <div class="run-header-meta" id="run-meta">${headerMeta()}</div>
      </div>
      <div class="run-header-right">
        ${statusPill(run.status)}
        <a href="/" data-nav><button class="ghost">← all runs</button></a>
      </div>
    </div>

    <div class="run-body">
      <div>
        <div class="panel" style="margin-bottom: 14px;">
          <div class="panel-head">Stages <span style="color:var(--muted); font-weight:400;">(${run.stages.length})</span></div>
          <div class="panel-body">
            <div class="stage-list" id="stage-list">${stagesHtml()}</div>
          </div>
        </div>

        ${blockersHtml()}
      </div>

      <div>
        <div class="panel">
          <div class="panel-head">
            Events
            <span style="color:var(--muted); font-weight:400;" id="events-count">${eventsBuffer.length}</span>
          </div>
          <div class="panel-body events" id="events">${eventsHtml()}</div>
        </div>
      </div>
    </div>
  `;
}

function headerMeta() {
  const m = run.meta ?? {};
  const flags = m.flags ?? {};
  const totalCost = Number(m.totalCostUsd ?? 0);
  const tokens = m.totalTokens ?? {};
  const total =
    Number(tokens.input ?? 0) +
    Number(tokens.output ?? 0) +
    Number(tokens.cacheRead ?? 0) +
    Number(tokens.cacheCreation ?? 0);
  const duration =
    m.startedAt && m.finishedAt ? Date.parse(m.finishedAt) - Date.parse(m.startedAt) : null;

  return `
    <span>started <code>${escapeHtml(relativeTime(m.startedAt))}</code></span>
    <span>cost <code>${fmtUsd(totalCost)}</code></span>
    <span>tokens <code>${fmtTokens(total)}</code></span>
    <span>duration <code>${duration ? fmtDuration(duration) : "—"}</code></span>
    <span>flags <code>ba=${escapeHtml(flags.ba ?? "?")} · lead=${escapeHtml(flags.lead ?? "?")} · design=${escapeHtml(flags.design ?? "?")}</code></span>
  `;
}

function stagesHtml() {
  if (run.stages.length === 0) {
    return `<div class="empty" style="padding: 10px;">No stages yet.</div>`;
  }
  return run.stages.map(stageCardHtml).join("");
}

function stageCardHtml(s) {
  const duration = s.durationMs
    ? fmtDuration(s.durationMs)
    : s.startedAt
      ? fmtDuration(Date.now() - Date.parse(s.startedAt))
      : "—";
  const summary = s.summary ?? (s.errorMessage ? `error: ${s.errorMessage}` : "");
  const cost = s.costUsd ? fmtUsd(s.costUsd) : "";
  const title = s.issueTitle
    ? `<span class="stage-issue-title" title="${escapeHtml(s.issueTitle)}">${escapeHtml(s.issueTitle)}</span>`
    : "";
  return `
    <div class="stage-card" data-slug="${escapeHtml(s.slug)}" data-status="${escapeHtml(s.status)}">
      <div class="stage-index">#${String(s.index).padStart(2, "0")}</div>
      <div class="stage-middle">
        <div class="stage-line1">
          ${roleChip(s.kind)}
          <span class="stage-issue">${escapeHtml(s.issueId)}</span>
          ${title}
          ${statusPill(s.status)}
        </div>
        <div class="stage-summary">${escapeHtml(summary)}</div>
      </div>
      <div class="stage-right">
        ${duration}<br/>
        ${cost}
      </div>
    </div>
  `;
}

function eventsHtml() {
  if (eventsBuffer.length === 0) {
    return `<div class="events-empty">No events yet.</div>`;
  }
  // newest at top
  return eventsBuffer.slice().reverse().map(eventRowHtml).join("");
}

function eventRowHtml(e) {
  const terminalGood = ["pipeline_complete", "exit_idle", "exit_blocked"].includes(e.type);
  const terminalBad = [
    "exit_error",
    "exit_all_failed",
    "exit_budget_exceeded",
    "exit_mcp_missing",
  ].includes(e.type);
  const typeClasses = `event-type${terminalGood ? " terminal" : ""}${terminalBad ? " terminal failed" : ""}`;
  const time = shortTime(e.t);
  const summary = summarise(e);
  const raw = escapeHtml(JSON.stringify(e.data, null, 2));
  return `
    <div class="event-row">
      <span class="event-time">${escapeHtml(time)}</span>
      <span class="${typeClasses}">${escapeHtml(e.type)}</span>
      <span class="event-data">
        ${summary}
        <details><summary style="cursor:pointer;color:var(--muted-strong);">raw</summary><pre>${raw}</pre></details>
      </span>
    </div>
  `;
}

function summarise(e) {
  const d = e.data ?? {};
  switch (e.type) {
    case "run_started":
    case "run_resumed":
      return `root=${escapeHtml(d.rootInput ?? "?")}`;
    case "plan":
      return `iter=${d.iter} · ${Array.isArray(d.actions) ? d.actions.length : 0} actions`;
    case "stage_started":
      return `${escapeHtml(d.kind ?? "")} ${escapeHtml(d.issueId ?? "")}`;
    case "stage_complete":
      return `${escapeHtml(d.kind ?? "")} ${escapeHtml(d.issueId ?? "")} · ${escapeHtml(d.status ?? "")} · ${fmtUsd(Number(d.costUsd ?? 0))}`;
    case "mcp_health":
      return `linear=${d.linearStatus ?? "?"}`;
    case "exit_blocked":
      return `${Array.isArray(d.blockers) ? d.blockers.length : 0} blockers`;
    case "exit_error":
      return escapeHtml(d.message ?? "error");
    default:
      try {
        return escapeHtml(JSON.stringify(d).slice(0, 120));
      } catch {
        return "";
      }
  }
}

function blockersHtml() {
  if (!Array.isArray(run.blockers) || run.blockers.length === 0) return "";
  const cards = run.blockers.map((b) => {
    const thread = b.questionThreadBody
      ? `<pre>${escapeHtml(String(b.questionThreadBody))}</pre>`
      : "";
    return `
      <div class="blocker-card">
        <header>
          <span class="title">${escapeHtml(b.issueId)} — ${escapeHtml(b.title ?? "")}</span>
          <a href="${escapeHtml(b.issueUrl ?? "#")}" target="_blank" rel="noreferrer">open in Linear ↗</a>
        </header>
        <div class="description">${escapeHtml(b.description ?? "")}</div>
        ${thread}
      </div>`;
  });
  return `
    <div class="panel">
      <div class="panel-head">Blockers <span style="color:var(--muted); font-weight:400;">(${run.blockers.length})</span></div>
      <div class="panel-body"><div class="blockers">${cards.join("")}</div></div>
    </div>
  `;
}

function wireDom(root) {
  for (const el of root.querySelectorAll(".stage-card")) {
    el.addEventListener("click", () => {
      const slug = el.dataset.slug;
      if (!slug) return;
      const url = new URL(location.href);
      url.searchParams.set("stage", slug);
      history.pushState({}, "", url.toString());
      openStage(run.runId, slug);
    });
  }
  // Delegate nav links
  root.addEventListener("click", (ev) => {
    const a = ev.target.closest?.("a[data-nav]");
    if (!a) return;
    ev.preventDefault();
    history.pushState({}, "", a.getAttribute("href"));
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function updateStages(root) {
  const el = root.querySelector("#stage-list");
  if (el) {
    el.innerHTML = stagesHtml();
    wireDom(root);
  }
  const subtitle = document.getElementById("subtitle");
  if (subtitle) subtitle.textContent = `${run.runId} · ${run.status}`;
}

function updateEvents(root) {
  const el = root.querySelector("#events");
  const count = root.querySelector("#events-count");
  if (!el || !count) return;
  el.innerHTML = eventsHtml();
  count.textContent = String(eventsBuffer.length);
}

function updateHeader(root) {
  const meta = root.querySelector("#run-meta");
  if (meta) meta.innerHTML = headerMeta();
  const statusEl = root.querySelector(".run-header-right .pill");
  if (statusEl && run.status) {
    statusEl.outerHTML = statusPill(run.status);
  }
}
