import * as runsView from "./views/runs.js";
import * as runView from "./views/run.js";
import { closeStage } from "./views/stage.js";

const root = document.getElementById("root");
const subtitle = document.getElementById("subtitle");

async function route() {
  closeStage();
  runsView.stop();
  runView.stop();
  if (subtitle) subtitle.textContent = "";

  const { pathname } = location;
  const m = pathname.match(/^\/runs\/([^/]+)\/?$/);
  if (m) {
    await runView.render(root, m[1]);
    return;
  }
  await runsView.render(root);
}

window.addEventListener("popstate", route);

// Intercept local link clicks for SPA routing
document.addEventListener("click", (ev) => {
  const a = ev.target.closest?.("a[data-nav]");
  if (!a) return;
  ev.preventDefault();
  history.pushState({}, "", a.getAttribute("href"));
  window.dispatchEvent(new PopStateEvent("popstate"));
});

// `/` keyboard shortcut for search box
document.addEventListener("keydown", (ev) => {
  if (ev.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "")) {
    const search = document.getElementById("search");
    if (search) {
      ev.preventDefault();
      search.focus();
    }
  }
});

route();
