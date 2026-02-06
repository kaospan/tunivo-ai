import type { IVisualProvider } from "./types";
import { GeminiVisualProvider } from "./gemini-provider";

export type { IVisualProvider, AnalysisResult, AnalyzeAudioOptions, GenerateFrameOptions, VisualFrame } from "./types";

let activeProvider: IVisualProvider | null = null;

export function getVisualProvider(): IVisualProvider {
  if (!activeProvider) {
    activeProvider = new GeminiVisualProvider();
  }
  return activeProvider;
}

export function setVisualProvider(provider: IVisualProvider): void {
  activeProvider = provider;
}
