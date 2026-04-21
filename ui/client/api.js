// Tiny fetch + SSE helpers.

export async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers ?? {}) } });
  if (!res.ok) {
    let message;
    try {
      message = (await res.json()).error ?? res.statusText;
    } catch {
      message = res.statusText;
    }
    throw new Error(`${res.status}: ${message}`);
  }
  return res.json();
}

/**
 * Open an EventSource and call handlers. Returns a close fn.
 *
 * handlers = { event: fn(data), snapshot: fn(data), ping: fn(), error: fn(err) }
 */
export function openSse(url, handlers) {
  const es = new EventSource(url);
  for (const [name, fn] of Object.entries(handlers)) {
    if (name === "error") continue;
    es.addEventListener(name, (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        data = ev.data;
      }
      fn(data);
    });
  }
  if (handlers.error) es.onerror = (ev) => handlers.error(ev);
  return () => es.close();
}
