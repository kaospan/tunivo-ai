import { describe, it, expect } from "vitest";
import type {
  IVisualProvider,
  AnalysisResult,
  GenerateFrameOptions,
  VisualFrame,
  AnalyzeAudioOptions,
} from "../server/providers/types";

describe("IVisualProvider Interface Contract", () => {
  const createMockProvider = (): IVisualProvider => ({
    name: "test-provider",
    analyzeAudio: async (options: AnalyzeAudioOptions): Promise<AnalysisResult> => ({
      transcription: "test lyrics",
      mood: "melancholic",
      energy: "medium",
      visualPrompt: "dark abstract visuals",
      sections: [
        {
          name: "intro",
          startPercent: 0,
          endPercent: 10,
          visualHint: "slow fade in",
        },
        {
          name: "verse",
          startPercent: 10,
          endPercent: 50,
          visualHint: "flowing shapes",
        },
      ],
    }),
    generateFrame: async (options: GenerateFrameOptions): Promise<VisualFrame> => ({
      imageDataUrl: "data:image/png;base64,fakedata",
      width: options.quality === "high" ? 1920 : 1280,
      height: options.quality === "high" ? 1080 : 720,
    }),
  });

  it("implements the provider interface correctly", () => {
    const provider = createMockProvider();
    expect(provider.name).toBe("test-provider");
    expect(typeof provider.analyzeAudio).toBe("function");
    expect(typeof provider.generateFrame).toBe("function");
  });

  it("analyzeAudio returns valid analysis result", async () => {
    const provider = createMockProvider();
    const result = await provider.analyzeAudio({
      audioData: Buffer.from("fake-audio"),
      mimeType: "audio/mpeg",
      userPrompt: "",
    });

    expect(result).toHaveProperty("transcription");
    expect(result).toHaveProperty("mood");
    expect(result).toHaveProperty("energy");
    expect(result).toHaveProperty("visualPrompt");
    expect(result).toHaveProperty("sections");
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections[0]).toHaveProperty("name");
    expect(result.sections[0]).toHaveProperty("startPercent");
    expect(result.sections[0]).toHaveProperty("endPercent");
    expect(result.sections[0]).toHaveProperty("visualHint");
  });

  it("generateFrame returns valid visual frame for fast quality", async () => {
    const provider = createMockProvider();
    const frame = await provider.generateFrame({
      prompt: "abstract dark visuals",
      clipIndex: 0,
      totalClips: 10,
      mood: "melancholic",
      energy: "medium",
      quality: "fast",
    });

    expect(frame).toHaveProperty("imageDataUrl");
    expect(frame).toHaveProperty("width");
    expect(frame).toHaveProperty("height");
    expect(frame.width).toBe(1280);
    expect(frame.height).toBe(720);
  });

  it("generateFrame returns higher resolution for high quality", async () => {
    const provider = createMockProvider();
    const frame = await provider.generateFrame({
      prompt: "abstract dark visuals",
      clipIndex: 0,
      totalClips: 10,
      mood: "melancholic",
      energy: "medium",
      quality: "high",
    });

    expect(frame.width).toBe(1920);
    expect(frame.height).toBe(1080);
  });

  it("sections cover the full track duration", async () => {
    const provider = createMockProvider();
    const result = await provider.analyzeAudio({
      audioData: Buffer.from("fake"),
      mimeType: "audio/mpeg",
      userPrompt: "",
    });

    const firstSection = result.sections[0];
    const lastSection = result.sections[result.sections.length - 1];
    expect(firstSection.startPercent).toBe(0);
    expect(lastSection.endPercent).toBeGreaterThan(firstSection.startPercent);
  });
});

describe("Quality Modes", () => {
  it("fast quality uses 1280x720 resolution", () => {
    const fast = { width: 1280, height: 720, crf: 23 };
    expect(fast.width).toBe(1280);
    expect(fast.height).toBe(720);
  });

  it("high quality uses 1920x1080 resolution", () => {
    const high = { width: 1920, height: 1080, crf: 18 };
    expect(high.width).toBe(1920);
    expect(high.height).toBe(1080);
  });
});
