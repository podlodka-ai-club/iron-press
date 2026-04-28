import { config } from "../config.js";
import { LinearClient } from "../linear/linear-client.js";
import { logger } from "../util/logger.js";
import type { LinearIssue, LinearIssueStatus } from "../linear/linear-contracts.js";
import { loadPollingState, savePollingState, type PollingState } from "./polling-state.js";

export interface PollResult {
  newIssues: LinearIssue[];
  state: PollingState;
}

/**
 * Polls for new issues from a Linear team or project.
 * Returns issues that haven't been processed yet.
 */
export async function pollForNewIssues(linearClient: LinearClient): Promise<PollResult> {
  const state = loadPollingState();
  const now = new Date().toISOString();

  logger.info(
    { lastPollTime: state.lastPollTime, polledTeam: config.pollingTeamId },
    "polling for new issues",
  );

  // Fetch issues from the configured team
  if (!config.pollingTeamId && !config.pollingProjectId) {
    throw new Error("Neither POLL_TEAM_ID nor POLL_PROJECT_ID is configured");
  }

  let allIssues: LinearIssue[] = [];
  if (config.pollingTeamId) {
    allIssues = await linearClient.fetchTeamIssues(config.pollingTeamId);
  } else if (config.pollingProjectId) {
    const project = await linearClient.fetchProject(config.pollingProjectId);
    allIssues = project.issues;
  }

  // Filter issues:
  // 1. By update/creation time (since last poll)
  // 2. By status (include/exclude filters)
  // 3. Exclude already-processed issues
  const lastPollTime = new Date(state.lastPollTime);
  const newIssues = allIssues.filter((issue) => {
    // Check if issue was updated/created after last poll
    const issueUpdatedAt = new Date(issue.updatedAt);
    const issueCreatedAt = new Date(issue.createdAt);
    const isNew = issueUpdatedAt > lastPollTime || issueCreatedAt > lastPollTime;

    if (!isNew) return false;

    // Check if already processed
    if (state.processedIssueIds.has(issue.id)) return false;

    // Check status filters
    const includeStatuses = new Set(config.pollingIncludeStatuses);
    const excludeStatuses = new Set(config.pollingExcludeStatuses);

    // If include list is specified, only include those statuses
    if (includeStatuses.size > 0 && !includeStatuses.has(issue.status)) {
      return false;
    }

    // Exclude statuses in the exclude list
    if (excludeStatuses.has(issue.status)) {
      return false;
    }

    return true;
  });

  // Sort by priority (ascending, so lower number = higher priority = comes first)
  // then by creation date (oldest first)
  newIssues.sort((a, b) => {
    // First sort by priority: lower number = higher priority
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;

    // Then sort by creation date: oldest first
    const aCreated = new Date(a.createdAt);
    const bCreated = new Date(b.createdAt);
    return aCreated.getTime() - bCreated.getTime();
  });

  logger.info(
    {
      allIssuesCount: allIssues.length,
      newIssuesCount: newIssues.length,
      newIssueIds: newIssues.map((i) => i.id),
    },
    "polling complete",
  );

  // Update state
  const updatedState: PollingState = {
    lastPollTime: now,
    processedIssueIds: new Set([
      ...state.processedIssueIds,
      ...newIssues.map((i) => i.id),
    ]),
  };
  savePollingState(updatedState);

  return {
    newIssues,
    state: updatedState,
  };
}
