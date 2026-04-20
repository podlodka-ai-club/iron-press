import { createReadStream, existsSync, statSync, unwatchFile, watchFile } from "node:fs";
import { createInterface } from "node:readline";

export interface TailOptions {
  pollIntervalMs?: number;
  includeBacklog?: boolean; // emit existing content as the first batch
}

/**
 * Watch a text file for appended lines.
 *
 * Emits each full newline-terminated line to `onLines`. Uses `fs.watchFile`
 * (polling) which is the only Node stdlib option that works reliably on both
 * Linux and Mac for files being appended to by a separate process.
 *
 * Returns an unsubscribe function.
 */
export function tailFile(
  filePath: string,
  onLines: (lines: string[]) => void,
  opts: TailOptions = {},
): () => void {
  const interval = opts.pollIntervalMs ?? 500;
  let offset = 0;
  let reading = false;
  let pendingRead = false;
  let stopped = false;

  async function readSince(prevSize: number, currSize: number): Promise<void> {
    if (currSize <= prevSize) return;
    if (reading) {
      pendingRead = true;
      return;
    }
    reading = true;
    try {
      // Ensure the file still exists and has the size we expect
      if (!existsSync(filePath)) {
        offset = 0;
        return;
      }
      const stat = statSync(filePath);
      const end = Math.min(currSize, stat.size);
      if (offset >= end) return;

      const stream = createReadStream(filePath, { start: offset, end: end - 1, encoding: "utf8" });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      const buffer: string[] = [];
      for await (const line of rl) {
        if (line.length > 0) buffer.push(line);
      }
      offset = end;
      if (buffer.length > 0 && !stopped) onLines(buffer);
    } finally {
      reading = false;
      if (pendingRead) {
        pendingRead = false;
        const latest = existsSync(filePath) ? statSync(filePath).size : 0;
        await readSince(offset, latest);
      }
    }
  }

  // Backlog (initial content)
  if (opts.includeBacklog !== false && existsSync(filePath)) {
    const size = statSync(filePath).size;
    void readSince(0, size);
  } else if (existsSync(filePath)) {
    offset = statSync(filePath).size;
  }

  const listener = (curr: { size: number }, prev: { size: number }) => {
    if (stopped) return;
    // File was truncated or replaced → reset
    if (curr.size < offset) offset = 0;
    if (curr.size !== prev.size) void readSince(prev.size, curr.size);
  };

  watchFile(filePath, { interval, persistent: false }, listener);

  return () => {
    stopped = true;
    unwatchFile(filePath, listener);
  };
}
