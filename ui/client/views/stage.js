import { fetchJson, openSse } from "../api.js";
import { escapeHtml, fmtDuration, fmtUsd, roleChip, shortTime, statusPill } from "../util.js";

let stage;
let runId;
let slug;
let activeTab = "transcript";
let transcript = [];
let toolCalls = [];
let closeStream;

export async function openStage(theRunId, theSlug) {
  runId = theRunId;
  slug = theSlug;
  const drawer = document.getElementById("drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  if (!drawer) return;
  drawer.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  drawer.innerHTML = `<div class="loading">Loading stage ${escapeHtml(slug)}…</div>`;
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.onclick = closeStage;
  }

  try {
    stage = await fetchJson(`/api/runs/${encodeURIComponent(runId)}/stages/${encodeURIComponent(slug)}`);
  } catch (err) {
    drawer.innerHTML = `<div class="empty">Stage not found: ${escapeHtml(err.message)}</div>`;
    return;
  }

  transcript = Array.isArray(stage.transcript) ? stage.transcript.slice() : [];
  toolCalls = Array.isArray(stage.toolCalls) ? stage.toolCalls.slice() : [];
  renderDrawer();

  if (stage.status === "running") {
    closeStream = openSse(
      `/api/runs/${encodeURIComponent(runId)}/stages/${encodeURIComponent(slug)}/stream`,
      {
        transcript: (m) => {
          transcript.push(m);
          if (activeTab === "transcript") renderBody();
        },
        toolcall: (m) => {
          toolCalls.push(m);
          if (activeTab === "toolcalls") renderBody();
        },
        result: (r) => {
          stage.result = r;
          stage.status = r?.status ?? "done";
          renderDrawer();
        },
        ping: () => {},
        error: () => {},
      },
    );
  }

  // Key handling: Esc to close
  document.addEventListener("keydown", keyHandler);
}

export function closeStage() {
  const drawer = document.getElementById("drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  if (drawer) {
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = "";
  }
  if (backdrop) {
    backdrop.hidden = true;
    backdrop.onclick = null;
  }
  document.removeEventListener("keydown", keyHandler);
  if (closeStream) {
    closeStream();
    closeStream = undefined;
  }
  // Drop ?stage= from URL if present
  const url = new URL(location.href);
  if (url.searchParams.has("stage")) {
    url.searchParams.delete("stage");
    history.pushState({}, "", url.toString());
  }
}

function keyHandler(ev) {
  if (ev.key === "Escape") closeStage();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderDrawer() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;
  drawer.innerHTML = `
    <div class="drawer-head">
      <h2>
        ${roleChip(stage.kind)}
        <span>${escapeHtml(stage.issueId)}</span>
        ${statusPill(stage.status)}
      </h2>
      <div class="run-header-right">
        ${metaLine()}
        <button class="ghost" id="drawer-close" title="Esc">✕</button>
      </div>
    </div>
    <div class="drawer-tabs" id="drawer-tabs">
      <button class="drawer-tab" data-tab="prompt">Prompt</button>
      <button class="drawer-tab" data-tab="transcript">Transcript <span class="count" id="tc-count">${transcript.length}</span></button>
      <button class="drawer-tab" data-tab="toolcalls">Tool calls <span class="count" id="tool-count">${toolCalls.length}</span></button>
      <button class="drawer-tab" data-tab="result">Result</button>
      <button class="drawer-tab" data-tab="stderr">Stderr${stage.stderr ? " <span class=\"count\">●</span>" : ""}</button>
    </div>
    <div class="drawer-body" id="drawer-body"></div>
  `;

  drawer.querySelector("#drawer-close")?.addEventListener("click", closeStage);
  const tabs = drawer.querySelector("#drawer-tabs");
  tabs?.addEventListener("click", (ev) => {
    const b = ev.target.closest?.("button.drawer-tab");
    if (!b) return;
    activeTab = b.dataset.tab;
    renderBody();
    drawer.querySelectorAll(".drawer-tab").forEach((t) => t.classList.toggle("active", t === b));
  });

  // Activate default tab
  const def = drawer.querySelector(`.drawer-tab[data-tab="${activeTab}"]`);
  if (def) def.classList.add("active");
  renderBody();
}

function metaLine() {
  const parts = [];
  if (stage.result?.costUsd) parts.push(fmtUsd(stage.result.costUsd));
  if (stage.result?.tokens) {
    const t = stage.result.tokens;
    const sum =
      Number(t.input ?? 0) +
      Number(t.output ?? 0) +
      Number(t.cacheRead ?? 0) +
      Number(t.cacheCreation ?? 0);
    if (sum) parts.push(`${sum.toLocaleString()} tok`);
  }
  return `<span class="kbd-hint">${parts.join(" · ")}</span>`;
}

function renderBody() {
  const body = document.getElementById("drawer-body");
  if (!body) return;
  const tcCount = document.getElementById("tc-count");
  const toolCount = document.getElementById("tool-count");
  if (tcCount) tcCount.textContent = String(transcript.length);
  if (toolCount) toolCount.textContent = String(toolCalls.length);

  switch (activeTab) {
    case "prompt":
      body.innerHTML = `<div class="prompt-view">${escapeHtml(stage.prompt || "(empty)")}</div>`;
      break;
    case "transcript":
      body.innerHTML = transcriptHtml();
      break;
    case "toolcalls":
      body.innerHTML = toolCallsHtml();
      break;
    case "result":
      body.innerHTML = resultHtml();
      break;
    case "stderr":
      body.innerHTML = stage.stderr
        ? `<pre style="white-space:pre-wrap; color: var(--red);">${escapeHtml(stage.stderr)}</pre>`
        : `<div class="empty">No stderr output.</div>`;
      break;
  }
}

function transcriptHtml() {
  if (transcript.length === 0) return `<div class="empty">No transcript yet.</div>`;
  return transcript.map(msgHtml).join("");
}

function msgHtml(m) {
  const type = m?.type ?? "unknown";
  let roleLabel = type;
  let bodyStr = "";
  let isProse = false;

  if (type === "assistant") {
    roleLabel = "assistant";
    const content = m?.message?.content;
    if (Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "text") {
          parts.push(`<div class="text">${escapeHtml(block.text ?? "")}</div>`);
          isProse = true;
        } else if (block.type === "tool_use") {
          parts.push(
            `<div class="tool-call"><strong>${escapeHtml(block.name ?? "")}</strong><pre>${escapeHtml(
              JSON.stringify(block.input ?? {}, null, 2),
            )}</pre></div>`,
          );
        } else if (block.type === "thinking") {
          parts.push(`<div style="color:var(--muted); font-style:italic;">${escapeHtml(block.thinking ?? "")}</div>`);
          isProse = true;
        }
      }
      bodyStr = parts.join("");
    }
  } else if (type === "user") {
    roleLabel = "user";
    const content = m?.message?.content;
    if (Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        if (block?.type === "tool_result") {
          const raw = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
          parts.push(`<pre>${escapeHtml(String(raw ?? ""))}</pre>`);
        } else if (block?.type === "text") {
          parts.push(`<div>${escapeHtml(block.text ?? "")}</div>`);
          isProse = true;
        }
      }
      bodyStr = parts.join("");
    } else if (typeof content === "string") {
      bodyStr = escapeHtml(content);
      isProse = true;
    }
  } else if (type === "system") {
    roleLabel = "system";
    bodyStr = `<pre>${escapeHtml(JSON.stringify(m, null, 2))}</pre>`;
  } else if (type === "result") {
    roleLabel = "result";
    const pieces = [];
    if (typeof m.total_cost_usd === "number") pieces.push(`cost=${fmtUsd(m.total_cost_usd)}`);
    if (m.usage && typeof m.usage === "object") pieces.push(`usage=${escapeHtml(JSON.stringify(m.usage))}`);
    bodyStr = pieces.join(" · ") || `<pre>${escapeHtml(JSON.stringify(m, null, 2))}</pre>`;
  } else {
    bodyStr = `<pre>${escapeHtml(JSON.stringify(m, null, 2))}</pre>`;
  }

  return `
    <div class="msg">
      <div class="msg-head">
        <span class="role ${escapeHtml(roleLabel)}">${escapeHtml(roleLabel)}</span>
      </div>
      <div class="msg-body ${isProse ? "prose" : ""}">${bodyStr || "(empty)"}</div>
    </div>
  `;
}

function toolCallsHtml() {
  if (toolCalls.length === 0) return `<div class="empty">No tool calls yet.</div>`;
  return toolCalls
    .map((t) => {
      const when = t?.t ? shortTime(t.t) : "";
      const name = t?.toolName ?? "(tool)";
      const phase = t?.when ?? "";
      const input = t?.toolInput ?? {};
      const response = t?.toolResponse;
      const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
      const respStr = response !== undefined ? JSON.stringify(response, null, 2) : "";
      return `
        <div class="tool-item">
          <header>
            <span class="name">${escapeHtml(name)}</span>
            <span class="when">${escapeHtml(phase)} · ${escapeHtml(when)}</span>
          </header>
          <details>
            <summary style="cursor:pointer;color:var(--muted-strong);font-size:11px;">input</summary>
            <pre>${escapeHtml(inputStr)}</pre>
          </details>
          ${respStr ? `<details><summary style="cursor:pointer;color:var(--muted-strong);font-size:11px;">response</summary><pre>${escapeHtml(respStr)}</pre></details>` : ""}
        </div>
      `;
    })
    .join("");
}

function resultHtml() {
  if (!stage.result) {
    return `<div class="empty">Stage still running — no result.json yet.</div>`;
  }
  const r = stage.result;
  const summary = r.summary
    ? `<div class="result-summary"><div class="label">Summary</div>${escapeHtml(r.summary)}</div>`
    : "";
  const hint = r.nextHint
    ? `<div class="result-summary"><div class="label">Next hint</div>${escapeHtml(r.nextHint)}</div>`
    : "";
  const err = r.errorMessage
    ? `<div class="result-summary" style="border-color: rgba(239,109,109,0.4); color: var(--red);"><div class="label">Error</div>${escapeHtml(r.errorMessage)}</div>`
    : "";
  const durationStr =
    stage.startedAt && stage.finishedAt
      ? fmtDuration(Date.parse(stage.finishedAt) - Date.parse(stage.startedAt))
      : "—";
  const meta = `
    <div class="result-summary">
      <div class="label">Metrics</div>
      cost ${fmtUsd(r.costUsd ?? 0)} · duration ${durationStr} · session <code>${escapeHtml(r.sessionId ?? "")}</code>
    </div>
  `;
  return `
    ${summary}${hint}${err}${meta}
    <div class="result-view">
      <pre>${escapeHtml(JSON.stringify(r, null, 2))}</pre>
    </div>
  `;
}
