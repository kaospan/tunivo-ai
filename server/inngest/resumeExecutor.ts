import { inngest } from "./client";
import { db } from "../db";
import { workflowInstances, executionLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runFromNode } from "./workflowExecutor";

/**
 * Inngest function to resume workflow execution
 */
export const resumeExecutor = inngest.createFunction(
  { 
    id: "workflow-resume", 
    name: "Workflow Resume Executor",
    // Add idempotency to prevent duplicate resumes
    idempotency: "event.data.instanceId + '-' + event.data.resumedAt"
  },
  { event: "app/workflow.resume" },
  async ({ event, step }) => {
    const { instanceId, resumedBy } = event.data;

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

    // Idempotency check: if already running or completed, skip
    if (instance.status === "RUNNING") {
      console.log(`[RESUME] Instance ${instanceId} is already running, skipping`);
      return { success: true, skipped: true, reason: "already_running" };
    }

    if (instance.status === "COMPLETED" || instance.status === "FAILED") {
      console.log(`[RESUME] Instance ${instanceId} is ${instance.status}, cannot resume`);
      return { success: false, skipped: true, reason: `already_${instance.status.toLowerCase()}` };
    }

    // Ensure we have a currentNodeId to resume from
    if (!instance.currentNodeId) {
      throw new Error(`Instance ${instanceId} has no currentNodeId to resume from`);
    }

    // Update status to RUNNING and clear resume token
    await step.run("update-status-running", async () => {
      await db
        .update(workflowInstances)
        .set({
          status: "RUNNING",
          resumeTokenHash: null,
          pausedBy: resumedBy || null,
          updatedAt: new Date(),
        })
        .where(eq(workflowInstances.id, instanceId));
    });

    // Continue execution from currentNodeId
    await step.run("resume-execution", async () => {
      await runFromNode(instanceId, instance.currentNodeId!);
    });

    return { success: true, instanceId };
  }
);
