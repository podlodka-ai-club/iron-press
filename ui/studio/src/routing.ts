import { useEffect, useState } from "react";

export interface Route {
  workflowName: string | null;
  mode: "design" | "run";
}

function parseRoute(pathname: string): Route {
  // /studio/:name or /studio/:name/design or /studio/:name/run
  const m = pathname.match(/\/studio\/([^/]+)(?:\/(design|run))?/);
  if (!m) return { workflowName: null, mode: "design" };
  return { workflowName: m[1] ?? null, mode: (m[2] as "design" | "run") ?? "design" };
}

export function useRoute(): { route: Route; navigate: (name: string, mode?: "design" | "run") => void } {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const handler = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  function navigate(name: string, mode: "design" | "run" = "design"): void {
    const url = `/studio/${encodeURIComponent(name)}/${mode}`;
    window.history.pushState(null, "", url);
    setRoute({ workflowName: name, mode });
  }

  return { route, navigate };
}
