import { inngest } from "./client";
import { db } from "../db";
import { workflowInstances, executionLogs, workflows } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID, scryptSync, randomBytes } from "crypto";

interface WorkflowNode {
  id: string;
  type: string;
  data?: any;
  next?: string | string[]; // Next node(s) to execute
}

interface WorkflowDefinition {
  nodes: Record<string, WorkflowNode>;
  startNode: string;
}

/**
 * Hash a resume token using scrypt
 */
function hashResumeToken(token: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(token, salt, 64).toString('hex');
  return `${salt}$${hash}`;
}

/**
 * Verify a resume token against a stored hash
 */
export function verifyResumeToken(token: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split('$');
  if (!salt || !hash) return false;
  
  const testHash = scryptSync(token, salt, 64).toString('hex');
  return testHash === hash;
}

/**
 * Execute a single workflow node
 */
async function executeNode(
  node: WorkflowNode,
  context: any,
  instanceId: string
): Promise<{ output: any; shouldPause: boolean; pauseToken?: string }> {
  // Create execution log for node start
  await db.insert(executionLogs).values({
    instanceId,
    nodeId: node.id,
    action: "NODE_STARTED",
    input: context,
  });

  // Handle different node types
  switch (node.type) {
    case "human":
    case "human_approval":
      // Generate resume token
      const resumeToken = randomUUID();
      const resumeTokenHash = hashResumeToken(resumeToken);

      // Create execution log for pause
      await db.insert(executionLogs).values({
        instanceId,
        nodeId: node.id,
        action: "PAUSED_FOR_HUMAN",
        input: context,
        output: { reason: "PAUSED_FOR_HUMAN", nodeData: node.data },
      });

      return { output: context, shouldPause: true, pauseToken: resumeToken };

    case "start":
      // Start node just passes through
      return { output: context, shouldPause: false };

    default:
      // For other node types, just pass through context for now
      // In a real implementation, you'd execute the node logic here
      await db.insert(executionLogs).values({
        instanceId,
        nodeId: node.id,
        action: "NODE_COMPLETED",
        input: context,
        output: context,
      });
      
      return { output: context, shouldPause: false };
  }
}

/**
 * Run workflow from a specific node
 */
export async function runFromNode(
  instanceId: string,
  startNodeId: string
): Promise<void> {
  // Fetch the instance
  const instances = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, instanceId))
    .limit(1);

  if (instances.length === 0) {
    throw new Error(`Instance ${instanceId} not found`);
  }

  const instance = instances[0];

  // Fetch the workflow definition
  const workflowRecords = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, instance.workflowId))
    .limit(1);

  if (workflowRecords.length === 0) {
    throw new Error(`Workflow ${instance.workflowId} not found`);
  }

  const workflowDef = workflowRecords[0].definition as WorkflowDefinition;
  let currentNodeId: string | null = startNodeId;
  let context = instance.context as any;

  // Traverse the workflow
  while (currentNodeId) {
    const node: WorkflowNode = workflowDef.nodes[currentNodeId];
    
    if (!node) {
      throw new Error(`Node ${currentNodeId} not found in workflow`);
    }

    // Execute the node
    const result = await executeNode(node, context, instanceId);
    context = result.output;

    // Check if we need to pause
    if (result.shouldPause) {
      // Update instance to WAITING_FOR_INPUT
      await db
        .update(workflowInstances)
        .set({
          status: "WAITING_FOR_INPUT",
          currentNodeId,
          resumeTokenHash: result.pauseToken ? hashResumeToken(result.pauseToken) : null,
          pauseMeta: node.data || {},
          context,
          updatedAt: new Date(),
        })
        .where(eq(workflowInstances.id, instanceId));

      // Log the resume token (in production, send via webhook/notification)
      console.log(`[WORKFLOW] Instance ${instanceId} paused at node ${currentNodeId}`);
      console.log(`[WORKFLOW] Resume token: ${result.pauseToken}`);
      
      return; // Exit the execution loop
    }

    // Move to next node
    if (node.next) {
      if (typeof node.next === "string") {
        currentNodeId = node.next;
      } else if (Array.isArray(node.next) && node.next.length > 0) {
        // For now, just take the first branch
        currentNodeId = node.next[0];
      } else {
        currentNodeId = null;
      }
    } else {
      currentNodeId = null; // No more nodes
    }
  }

  // Workflow completed
  await db
    .update(workflowInstances)
    .set({
      status: "COMPLETED",
      context,
      updatedAt: new Date(),
    })
    .where(eq(workflowInstances.id, instanceId));

  await db.insert(executionLogs).values({
    instanceId,
    action: "WORKFLOW_COMPLETED",
    output: context,
  });

  console.log(`[WORKFLOW] Instance ${instanceId} completed`);
}

/**
 * Inngest function to execute workflows
 */
export const workflowExecutor = inngest.createFunction(
  { id: "workflow-executor", name: "Workflow Executor" },
  { event: "app/workflow.start" },
  async ({ event, step }) => {
    const { instanceId } = event.data;

    // Fetch the instance
    const instances = await step.run("fetch-instance", async () => {
      return await db
        .select()
        .from(workflowInstances)
        .where(eq(workflowInstances.id, instanceId))
        .limit(1);
    });

    if (instances.length === 0) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const instance = instances[0];

    // Update status to RUNNING
    await step.run("update-status-running", async () => {
      await db
        .update(workflowInstances)
        .set({
          status: "RUNNING",
          updatedAt: new Date(),
        })
        .where(eq(workflowInstances.id, instanceId));
    });

    // Fetch workflow definition
    const workflowRecords = await step.run("fetch-workflow", async () => {
      return await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, instance.workflowId))
        .limit(1);
    });

    if (workflowRecords.length === 0) {
      throw new Error(`Workflow ${instance.workflowId} not found`);
    }

    const workflowDef = workflowRecords[0].definition as WorkflowDefinition;

    // Start execution from the start node
    await step.run("execute-workflow", async () => {
      await runFromNode(instanceId, workflowDef.startNode);
    });

    return { success: true, instanceId };
  }
);
