import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export interface PollingState {
  lastPollTime: string; // ISO 8601 timestamp
  processedIssueIds: Set<string>; // Issues already processed
}

const POLLING_STATE_PATH = path.join(config.runsDir, "polling-state.json");

interface PollingStateFile {
  lastPollTime: string;
  processedIssueIds: string[];
}

export function loadPollingState(): PollingState {
  if (!existsSync(POLLING_STATE_PATH)) {
    return {
      lastPollTime: new Date(0).toISOString(), // Start from epoch
      processedIssueIds: new Set(),
    };
  }

  try {
    const content = readFileSync(POLLING_STATE_PATH, "utf8");
    const data = JSON.parse(content) as PollingStateFile;
    return {
      lastPollTime: data.lastPollTime,
      processedIssueIds: new Set(data.processedIssueIds),
    };
  } catch (e) {
    console.error("Failed to load polling state, starting fresh:", e);
    return {
      lastPollTime: new Date(0).toISOString(),
      processedIssueIds: new Set(),
    };
  }
}

export function savePollingState(state: PollingState): void {
  const data: PollingStateFile = {
    lastPollTime: state.lastPollTime,
    processedIssueIds: Array.from(state.processedIssueIds),
  };
  writeFileSync(POLLING_STATE_PATH, JSON.stringify(data, null, 2));
}
