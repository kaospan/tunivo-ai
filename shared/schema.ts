import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

// === SCHEMAS ===

export const insertProjectSchema = createInsertSchema(projects).omit({ 
  id: true, 
  createdAt: true, 
  duration: true, 
  bpm: true, 
  outputVideoUrl: true,
  progress: true,
  totalClips: true,
  generatedClips: true,
  takeNumber: true,
});

export const insertClipSchema = createInsertSchema(clips).omit({ 
  id: true, 
  createdAt: true 
});

// === EXPLICIT TYPES ===

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Clip = typeof clips.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;

// Request types
export type CreateProjectRequest = {
  title?: string;
  prompt: string;
  // File is handled via FormData, not JSON body for the initial create usually, 
  // but if we do 2-step (upload then create), we use this. 
  // For this app, we'll likely use FormData for the creation endpoint.
};

export type UpdateProjectRequest = Partial<InsertProject>;

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

