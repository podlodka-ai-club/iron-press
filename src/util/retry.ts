import pRetry, { AbortError, type Options } from "p-retry";
import { config } from "../config.js";
import { logger } from "./logger.js";

export { AbortError };

/**
 * Wrap an operation with the orchestrator's default retry policy (exponential backoff + jitter).
 * Non-transient errors should be thrown as AbortError to skip retries.
 */
export async function withRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  overrides?: Partial<Options>,
): Promise<T> {
  return pRetry(
    async (attempt) => {
      try {
        return await fn(attempt);
      } catch (err) {
        logger.warn({ label, attempt, err: errMessage(err) }, "retry attempt failed");
        throw err;
      }
    },
    {
      retries: config.retry.retries,
      minTimeout: config.retry.minTimeoutMs,
      maxTimeout: config.retry.maxTimeoutMs,
      factor: config.retry.factor,
      randomize: true,
      ...overrides,
    },
  );
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
