export interface VisualFrame {
  imageDataUrl: string;
  width: number;
  height: number;
}

export interface GenerateFrameOptions {
  prompt: string;
  clipIndex: number;
  totalClips: number;
  mood: string;
  energy: string;
  quality: "fast" | "high";
  sectionHint?: string;
}

export interface AnalysisResult {
  transcription: string;
  mood: string;
  energy: string;
  visualPrompt: string;
  sections: {
    name: string;
    startPercent: number;
    endPercent: number;
    visualHint: string;
  }[];
}

export interface AnalyzeAudioOptions {
  audioData: Buffer;
  mimeType: string;
  userPrompt: string;
}

export interface IVisualProvider {
  readonly name: string;
  analyzeAudio(options: AnalyzeAudioOptions): Promise<AnalysisResult>;
  generateFrame(options: GenerateFrameOptions): Promise<VisualFrame>;
}
