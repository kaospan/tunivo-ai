import { GoogleGenAI } from "@google/genai";
import { generateImage } from "../replit_integrations/image";
import type {
  IVisualProvider,
  AnalyzeAudioOptions,
  AnalysisResult,
  GenerateFrameOptions,
  VisualFrame,
} from "./types";

export class GeminiVisualProvider implements IVisualProvider {
  readonly name = "gemini";
  private client: InstanceType<typeof GoogleGenAI>;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }

  async analyzeAudio(options: AnalyzeAudioOptions): Promise<AnalysisResult> {
    const isAutoStyle = !options.userPrompt;

    const analysisPrompt = isAutoStyle
      ? `You are an expert creative director and music analyst.
Analyze this audio track thoroughly. Determine:
- Tempo / BPM estimate
- Energy level (low/medium/high)
- Mood (e.g., calm, melancholic, dark, upbeat, aggressive, dreamy, euphoric)
- Genre feel
- Section changes you can detect (intro, verse, chorus, bridge, outro)
- Emotional arc from start to finish

Based on your analysis, create a detailed visual prompt for a music video that:
- Uses abstract, cinematic, atmospheric visuals (no people or text)
- Has a consistent color palette that matches the mood
- Describes smooth camera movements that follow the tempo
- Evolves visually as the song progresses through sections
- Prioritizes visual coherence and smooth transitions

Format as JSON: { "transcription": "lyrics if any, or empty string", "mood": "one-line mood description", "energy": "low|medium|high", "visualPrompt": "detailed cinematic visual description", "sections": [{"name": "intro", "startPercent": 0, "endPercent": 10, "visualHint": "description"}] }`
      : `You are an expert creative director and music analyst.
Analyze this audio track. The user wants this visual style: "${options.userPrompt}"

Determine the song's mood, energy, tempo, and structure. Then create a refined, production-ready visual prompt that:
- Honors the user's style request: "${options.userPrompt}"
- Adapts the style to match the music's energy and sections
- Describes specific visual elements, colors, camera movements
- Ensures visual continuity across multiple clips

Format as JSON: { "transcription": "lyrics if any, or empty string", "mood": "one-line mood description", "energy": "low|medium|high", "visualPrompt": "refined cinematic visual description based on user's style", "sections": [{"name": "intro", "startPercent": 0, "endPercent": 10, "visualHint": "description"}] }`;

    const analysisResponse = await this.client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: options.audioData.toString("base64"),
                mimeType: options.mimeType,
              },
            },
            { text: analysisPrompt },
          ],
        },
      ],
    });

    try {
      const rawText = (analysisResponse.text || "").replace(/```json|```/g, "").trim();
      return JSON.parse(rawText) as AnalysisResult;
    } catch {
      return {
        transcription: "",
        mood: "cinematic",
        energy: "medium",
        visualPrompt:
          options.userPrompt ||
          "Abstract cinematic visuals with flowing light, deep colors, and smooth motion",
        sections: [],
      };
    }
  }

  async generateFrame(options: GenerateFrameOptions): Promise<VisualFrame> {
    const imageDataUrl = await generateImage(options.prompt);
    const isHigh = options.quality === "high";
    return {
      imageDataUrl,
      width: isHigh ? 1920 : 1280,
      height: isHigh ? 1080 : 720,
    };
  }
}
