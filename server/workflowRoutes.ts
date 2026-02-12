import type { Express } from "express";
import { db } from "./db";
import { workflowInstances, workflows, executionLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { verifyResumeToken } from "./inngest/workflowExecutor";
import { inngest } from "./inngest";
import { randomUUID } from "crypto";

/**
 * Register workflow-related API routes
 */
export function registerWorkflowRoutes(app: Express) {
  
  // Create a new workflow instance and start execution
  app.post("/api/v1/workflows/:workflowId/instances", async (req, res) => {
    try {
      const { workflowId } = req.params;
      const { context = {} } = req.body;

      // Check if workflow exists
      const workflowRecords = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, workflowId))
        .limit(1);

      if (workflowRecords.length === 0) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      // Create instance
      const instanceId = randomUUID();
      await db.insert(workflowInstances).values({
        id: instanceId,
        workflowId,
        status: "PENDING",
        context,
      });

      // Send Inngest event to start execution
      await inngest.send({
        name: "app/workflow.start",
        data: { instanceId },
      });

      res.status(201).json({ instanceId, status: "PENDING" });
    } catch (err) {
      console.error("Failed to create workflow instance:", err);
      res.status(500).json({ message: "Failed to create workflow instance" });
    }
  });

  // Get workflow instance status
  app.get("/api/v1/instances/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const instances = await db
        .select()
        .from(workflowInstances)
        .where(eq(workflowInstances.id, id))
        .limit(1);

      if (instances.length === 0) {
        return res.status(404).json({ message: "Instance not found" });
      }

      res.json(instances[0]);
    } catch (err) {
      console.error("Failed to fetch instance:", err);
      res.status(500).json({ message: "Failed to fetch instance" });
    }
  });

  // Resume a paused workflow instance
  app.post("/api/v1/instances/:id/resume", async (req, res) => {
    try {
      const { id } = req.params;
      const { resumeToken, input = {}, action = "approve" } = req.body;

      // Fetch the instance
      const instances = await db
        .select()
        .from(workflowInstances)
        .where(eq(workflowInstances.id, id))
        .limit(1);

      if (instances.length === 0) {
        return res.status(404).json({ message: "Instance not found" });
      }

      const instance = instances[0];

      // Check if instance is waiting for input
      if (instance.status !== "WAITING_FOR_INPUT") {
        return res.status(400).json({ 
          message: `Instance is not waiting for input (status: ${instance.status})` 
        });
      }

      // Verify resume token if provided
      if (instance.resumeTokenHash) {
        if (!resumeToken) {
          return res.status(401).json({ message: "Resume token is required" });
        }

        if (!verifyResumeToken(resumeToken, instance.resumeTokenHash)) {
          return res.status(401).json({ message: "Invalid resume token" });
        }
      }

      // In production, you'd validate user authentication and permissions here
      // For now, we'll use a simple userId from the request body or default
      const userId = req.body.userId || "system";

      // Merge input into context
      const updatedContext = {
        ...(instance.context as any),
        ...input,
        _resumeAction: action,
      };

      // Create execution log for resume
      await db.insert(executionLogs).values({
        instanceId: id,
        nodeId: instance.currentNodeId || undefined,
        action: "RESUMED",
        input: input,
        userId,
      });

      // Update instance with merged context
      await db
        .update(workflowInstances)
        .set({
          context: updatedContext,
          status: "RUNNING",
          pausedBy: userId,
          resumeTokenHash: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowInstances.id, id));

      // Send Inngest event to resume execution
      await inngest.send({
        name: "app/workflow.resume",
        data: { 
          instanceId: id, 
          resumedBy: userId,
          resumedAt: new Date().toISOString(),
        },
      });

      res.json({ 
        success: true, 
        message: "Workflow resumed",
        instanceId: id,
      });
    } catch (err) {
      console.error("Failed to resume instance:", err);
      res.status(500).json({ message: "Failed to resume instance" });
    }
  });

  // Get execution logs for an instance
  app.get("/api/v1/instances/:id/logs", async (req, res) => {
    try {
      const { id } = req.params;

      const logs = await db
        .select()
        .from(executionLogs)
        .where(eq(executionLogs.instanceId, id))
        .orderBy(executionLogs.createdAt);

      res.json(logs);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  });
}
