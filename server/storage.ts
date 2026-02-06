import { db } from "./db";
import {
  projects,
  clips,
  type Project,
  type InsertProject,
  type Clip,
  type InsertClip,
  type UpdateProjectRequest
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectByAudioHash(audioHash: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: UpdateProjectRequest): Promise<Project>;
  deleteProject(id: number): Promise<void>;

  // Clips
  getClips(projectId: number): Promise<Clip[]>;
  createClip(clip: InsertClip): Promise<Clip>;
  updateClip(id: number, updates: Partial<InsertClip>): Promise<Clip>;
  deleteClips(projectId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // === PROJECTS ===
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectByAudioHash(audioHash: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.audioHash, audioHash));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: number, updates: UpdateProjectRequest): Promise<Project> {
    const [project] = await db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // === CLIPS ===
  async getClips(projectId: number): Promise<Clip[]> {
    return await db.select().from(clips)
      .where(eq(clips.projectId, projectId))
      .orderBy(clips.sequenceOrder);
  }

  async createClip(insertClip: InsertClip): Promise<Clip> {
    const [clip] = await db.insert(clips).values(insertClip).returning();
    return clip;
  }

  async updateClip(id: number, updates: Partial<InsertClip>): Promise<Clip> {
    const [clip] = await db.update(clips)
      .set(updates)
      .where(eq(clips.id, id))
      .returning();
    return clip;
  }

  async deleteClips(projectId: number): Promise<void> {
    await db.delete(clips).where(eq(clips.projectId, projectId));
  }
}

export const storage = new DatabaseStorage();
