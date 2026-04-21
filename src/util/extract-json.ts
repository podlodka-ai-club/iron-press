/**
 * Extract the **last** fenced ```json block from a free-text response.
 * Returns null if none found.
 *
 * Stage runners ask the model to emit its StageResult as a fenced json block at
 * the end of the response. We take the *last* one — it's the most recent and
 * most likely to be the intended result, even if the model emitted drafts.
 */
export function extractLastFencedJson(text: string): string | null {
  if (!text) return null;
  const fenceRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let lastMatch: string | null = null;
  for (const m of text.matchAll(fenceRegex)) {
    const body = m[1]?.trim();
    if (!body) continue;
    // heuristic: only keep if it parses as JSON
    try {
      JSON.parse(body);
      lastMatch = body;
    } catch {
      // ignore — probably not a JSON block
    }
  }
  return lastMatch;
}
