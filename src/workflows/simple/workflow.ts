import { WorkflowBuilder, type Workflow } from "@/sdk/workflow";
import type { RunLog } from "@/runs/run-log";
import { BaNode } from "./nodes/ba";
import { EngNode } from "./nodes/eng";

interface SimpleWorkflowState {
  issueId: string;
  runId: string;
}

/**
 * BA → Eng.
 *
 * Edge map:
 *   BA  Pass           → Eng
 *   BA  WaitUserInput  → suspend (human answers blocking questions)
 *   BA  Fail           → terminate
 *   Eng Pass           → end (done)
 *   Eng Fail           → terminate
 */
export function simpleWorkflow(runLog: RunLog, cwd: string): Workflow<SimpleWorkflowState> {
  return new WorkflowBuilder<SimpleWorkflowState>()
    .addNode(new BaNode<SimpleWorkflowState>(runLog, cwd))
    .addNode(new EngNode<SimpleWorkflowState>(runLog, cwd))
    .addEdge("ba", "eng", "Pass")
    .setInitialNode("ba")
    .build();
}
