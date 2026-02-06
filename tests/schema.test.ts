import { describe, it, expect } from "vitest";
import { insertProjectSchema, insertClipSchema } from "../shared/schema";

describe("Project Schema Validation", () => {
  it("accepts a valid project with all required fields", () => {
    const result = insertProjectSchema.safeParse({
      title: "Test Song",
      prompt: "dreamy abstract visuals",
      originalAudioUrl: "/uploads/test.mp3",
      audioFilename: "test.mp3",
      status: "pending",
      quality: "fast",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a project with empty prompt for auto-style", () => {
    const result = insertProjectSchema.safeParse({
      title: "Auto Style Project",
      prompt: "",
      originalAudioUrl: "/uploads/test.mp3",
      audioFilename: "test.mp3",
      status: "pending",
      quality: "fast",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a project with audioHash for deduplication", () => {
    const result = insertProjectSchema.safeParse({
      title: "Dedup Test",
      prompt: "",
      originalAudioUrl: "/uploads/test.mp3",
      audioFilename: "test.mp3",
      audioHash: "abc123hash",
      status: "pending",
      quality: "fast",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a project missing required originalAudioUrl", () => {
    const result = insertProjectSchema.safeParse({
      title: "Bad Project",
      prompt: "test",
      audioFilename: "test.mp3",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a project missing required audioFilename", () => {
    const result = insertProjectSchema.safeParse({
      title: "Bad Project",
      prompt: "test",
      originalAudioUrl: "/uploads/test.mp3",
    });
    expect(result.success).toBe(false);
  });
});

describe("Clip Schema Validation", () => {
  it("accepts a valid clip", () => {
    const result = insertClipSchema.safeParse({
      projectId: 1,
      url: "/generated/clip_1.mp4",
      promptUsed: "abstract visuals",
      duration: 4,
      sequenceOrder: 0,
      status: "pending",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a clip missing projectId", () => {
    const result = insertClipSchema.safeParse({
      url: "/generated/clip.mp4",
      duration: 4,
      sequenceOrder: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a clip missing duration", () => {
    const result = insertClipSchema.safeParse({
      projectId: 1,
      url: "/generated/clip.mp4",
      sequenceOrder: 0,
    });
    expect(result.success).toBe(false);
  });
});
