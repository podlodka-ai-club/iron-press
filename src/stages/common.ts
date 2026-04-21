import type { Action } from "../types/contracts.js";
import { STAGE_RESULT_CONTRACT_MARKDOWN } from "../types/contracts.js";

/**
 * Shared closing section appended to every stage's user prompt so the LLM
 * always produces a parseable StageResult.
 */
export function stageResultPostamble(): string {
  return `

## Orchestrator output contract (MANDATORY)

When you are completely done with your work, emit exactly one fenced JSON block
matching the StageResult schema below as the **last** thing in your response.
Do not wrap it in prose; the orchestrator parses the last JSON block in the
transcript.

${STAGE_RESULT_CONTRACT_MARKDOWN}

Rules:
- \`status\`: \`done\` if the stage finished successfully (with or without open
  questions). \`blocked\` if you cannot proceed and require human help beyond
  what was requested. \`failed\` only if you hit an error you can't recover
  from — include \`errorMessage\`.
- \`questionsPosted\`: true if you posted a new \`## Questions from …\` comment
  that now awaits a reply.
- \`issueIdsCreated\`: new Linear issue identifiers you created this run.
- \`issueIdsUpdated\`: issues you updated (description, status, comments).
- \`summary\`: 1-3 plain-English sentences describing the outcome.
`;
}

export function buildUserPrompt(action: Action, args: string): string {
  const head = `# Stage: ${action.kind}

You were dispatched by the agent orchestrator. Treat the arguments below
exactly as if they had been passed to the equivalent slash command.

**Arguments**: \`${args}\`
**Reason**: ${action.reason}
`;
  return head + stageResultPostamble();
}
