import { config } from "@/config";
import { logger } from "@/util/logger";
import { LinearClient } from "@/linear/linear-client";

export function getLinear(): LinearClient {
  if (!config.linearApiKey) {
    throw new Error("LINEAR_API_KEY is not set — pass-check needs Linear API access.");
  }
  return new LinearClient(config.linearApiKey, logger);
}
