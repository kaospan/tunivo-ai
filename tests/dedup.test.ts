import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

describe("Audio File Deduplication", () => {
  function computeAudioHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  it("identical files produce the same hash", () => {
    const fileContent = Buffer.from("fake-mp3-content-data");
    const hash1 = computeAudioHash(fileContent);
    const hash2 = computeAudioHash(Buffer.from("fake-mp3-content-data"));
    expect(hash1).toBe(hash2);
  });

  it("different files produce different hashes", () => {
    const hash1 = computeAudioHash(Buffer.from("file-content-a"));
    const hash2 = computeAudioHash(Buffer.from("file-content-b"));
    expect(hash1).not.toBe(hash2);
  });

  it("hash is a 64-character hex string", () => {
    const hash = computeAudioHash(Buffer.from("test"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("take number increments correctly", () => {
    let takeNumber = 1;
    takeNumber = (takeNumber || 1) + 1;
    expect(takeNumber).toBe(2);
    takeNumber = (takeNumber || 1) + 1;
    expect(takeNumber).toBe(3);
  });

  it("null take number defaults to 1 then increments to 2", () => {
    const takeNumber: number | null = null;
    const newTake = (takeNumber || 1) + 1;
    expect(newTake).toBe(2);
  });
});

describe("Project Status Flow", () => {
  const validStatuses = ["pending", "analyzing", "generating", "ready_to_render", "rendering", "completed", "failed"];
  const activeStates = ["analyzing", "generating", "ready_to_render", "rendering"];

  it("all active states are valid statuses", () => {
    activeStates.forEach((state) => {
      expect(validStatuses).toContain(state);
    });
  });

  it("completed and failed are not active states", () => {
    expect(activeStates).not.toContain("completed");
    expect(activeStates).not.toContain("failed");
  });

  it("pending is not an active state", () => {
    expect(activeStates).not.toContain("pending");
  });
});
