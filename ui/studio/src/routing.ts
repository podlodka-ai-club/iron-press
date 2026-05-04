import { useEffect, useState } from "react";

export interface Route {
  workflowName: string | null;
  mode: "design" | "run";
  /** If set, we're in run-monitor mode showing a specific run's graph. */
  runId: string | null;
}

function parseRoute(pathname: string): Route {
  // /studio/run/:runId — live workflow visualization for a run
  const runMatch = pathname.match(/\/studio\/run\/([^/]+)/);
  if (runMatch) {
    return { workflowName: null, mode: "run", runId: decodeURIComponent(runMatch[1] ?? "") };
  }

  // /studio/:name or /studio/:name/design or /studio/:name/run
  const m = pathname.match(/\/studio\/([^/]+)(?:\/(design|run))?/);
  if (!m) return { workflowName: null, mode: "design", runId: null };
  return { workflowName: m[1] ?? null, mode: (m[2] as "design" | "run") ?? "design", runId: null };
}

export function useRoute(): {
  route: Route;
  navigate: (name: string, mode?: "design" | "run") => void;
  navigateToRun: (runId: string) => void;
} {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const handler = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  function navigate(name: string, mode: "design" | "run" = "design"): void {
    const url = `/studio/${encodeURIComponent(name)}/${mode}`;
    window.history.pushState(null, "", url);
    setRoute({ workflowName: name, mode, runId: null });
  }

  function navigateToRun(runId: string): void {
    const url = `/studio/run/${encodeURIComponent(runId)}`;
    window.history.pushState(null, "", url);
    setRoute({ workflowName: null, mode: "run", runId });
  }

  return { route, navigate, navigateToRun };
}
