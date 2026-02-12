import { pgTable, text, serial, integer, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === ENUMS ===

export const executionStatusEnum = pgEnum("execution_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "WAITING_FOR_INPUT"
]);

// === TABLE DEFINITIONS ===

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default("Untitled Project"),
  prompt: text("prompt").notNull().default(""),
  originalAudioUrl: text("original_audio_url").notNull(),
  audioFilename: text("audio_filename").notNull(),
  audioHash: text("audio_hash"),
  status: text("status").notNull().default("pending"),
  quality: text("quality").notNull().default("fast"),
  duration: integer("duration"),
  bpm: integer("bpm"),
  lyrics: text("lyrics"),
  mood: text("mood"),
  progress: integer("progress").default(0),
  totalClips: integer("total_clips").default(0),
  generatedClips: integer("generated_clips").default(0),
  takeNumber: integer("take_number").default(1),
  outputVideoUrl: text("output_video_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clips = pgTable("clips", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(), // Foreign key to projects
  url: text("url").notNull(),
  promptUsed: text("prompt_used"),
  duration: integer("duration").notNull(), // in seconds
  sequenceOrder: integer("sequence_order").notNull(),
  status: text("status").notNull().default("pending"), // pending, generated
  createdAt: timestamp("created_at").defaultNow(),
});

// Workflow execution tables
export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(), // Workflow graph/nodes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workflowInstances = pgTable("workflow_instances", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull().references(() => workflows.id),
  status: executionStatusEnum("status").notNull().default("PENDING"),
  context: jsonb("context").notNull().default({}),
  totalTokens: integer("total_tokens").notNull().default(0),
  totalCost: text("total_cost").notNull().default("0.0"), // Store as text to avoid decimal precision issues
  currentNodeId: text("current_node_id"),
  pausedBy: text("paused_by"),
  resumeTokenHash: text("resume_token_hash"),
  pauseMeta: jsonb("pause_meta"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const executionLogs = pgTable("execution_logs", {
  id: serial("id").primaryKey(),
  instanceId: text("instance_id").notNull().references(() => workflowInstances.id),
  nodeId: text("node_id"),
  action: text("action").notNull(), // e.g., "NODE_STARTED", "NODE_COMPLETED", "PAUSED_FOR_HUMAN", "RESUMED"
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  userId: text("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS ===

export const insertProjectSchema = createInsertSchema(projects).omit({ 
  id: true, 
  createdAt: true,
});

export const insertClipSchema = createInsertSchema(clips).omit({ 
  id: true, 
  createdAt: true 
});

export const insertWorkflowSchema = createInsertSchema(workflows).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertWorkflowInstanceSchema = createInsertSchema(workflowInstances).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertExecutionLogSchema = createInsertSchema(executionLogs).omit({
  id: true,
  createdAt: true,
});

// === EXPLICIT TYPES ===

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Clip = typeof clips.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;

export type WorkflowInstance = typeof workflowInstances.$inferSelect;
export type InsertWorkflowInstance = z.infer<typeof insertWorkflowInstanceSchema>;

export type ExecutionLog = typeof executionLogs.$inferSelect;
export type InsertExecutionLog = z.infer<typeof insertExecutionLogSchema>;

export type ExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "WAITING_FOR_INPUT";

// For updates, allow partial fields including computed fields
export type UpdateProject = Partial<Omit<Project, 'id' | 'createdAt'>>;
export type UpdateWorkflowInstance = Partial<Omit<WorkflowInstance, 'id' | 'createdAt'>>;

// Request types
export type CreateProjectRequest = {
  title?: string;
  prompt: string;
  // File is handled via FormData, not JSON body for the initial create usually, 
  // but if we do 2-step (upload then create), we use this. 
  // For this app, we'll likely use FormData for the creation endpoint.
};

export type UpdateProjectRequest = UpdateProject;

// Response types
export interface ProjectResponse extends Project {
  clips?: Clip[];
}

export type ProjectsListResponse = Project[];

export interface GenerateProgressResponse {
  status: string;
  progress: number;
  message?: string;
}

// Re-export chat models
export { conversations, messages } from "./models/chat";
export type { Conversation, InsertConversation, Message, InsertMessage } from "./models/chat";

