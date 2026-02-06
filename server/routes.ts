import { type Project } from "@shared/schema";
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { parseFile } from 'music-metadata';
import ffmpeg from 'fluent-ffmpeg';
import { randomUUID, createHash } from "crypto";
import express from 'express';
import { getVisualProvider } from "./providers";
import type { AnalysisResult } from "./providers";

function computeFileHash(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "client/public/generated");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const storageConfig = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storageConfig });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use('/generated', express.static(OUTPUT_DIR));
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.get(api.projects.list.path, async (req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get(api.projects.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const clips = await storage.getClips(project.id);
    res.json({ ...project, clips });
  });

  app.post(api.projects.create.path, upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file uploaded" });
      }

      const prompt = (req.body.prompt || "").trim();
      const title = (req.body.title || "Untitled Project").trim();
      const rawQuality = (req.body.quality || "fast").trim();
      const quality = rawQuality === "high" ? "high" : "fast";

      const audioHash = computeFileHash(req.file.path);

      const existingProject = await storage.getProjectByAudioHash(audioHash);
      if (existingProject) {
        try { fs.unlinkSync(req.file.path); } catch {}

        return res.status(200).json({ ...existingProject, duplicate: true });
      }

      let duration = 0;
      let bpm = 120;

      try {
        const metadata = await parseFile(req.file.path);
        duration = Math.round(metadata.format.duration || 0);
        bpm = Math.round(metadata.common.bpm || 120);
      } catch (e) {
        console.error("Audio analysis failed", e);
      }

      const fileMimeType = req.file.mimetype || "audio/mpeg";

      const project = await storage.createProject({
        title,
        prompt,
        originalAudioUrl: req.file.filename,
        audioFilename: req.file.originalname,
        audioHash,
        status: "analyzing",
        quality,
        duration,
        bpm,
        outputVideoUrl: null
      });

      res.status(201).json(project);

      runFullPipeline(project, fileMimeType);

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.post(api.projects.generate.path, async (req, res) => {
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const activeStates = ['analyzing', 'generating', 'rendering', 'ready_to_render'];
    if (activeStates.includes(project.status)) {
      return res.status(409).json({ message: 'Project is already being processed' });
    }

    const newTake = (project.takeNumber || 1) + 1;
    const updatedProject = await storage.updateProject(projectId, { status: "generating", progress: 0, generatedClips: 0, totalClips: 0, takeNumber: newTake });

    const ext = path.extname(updatedProject.audioFilename).toLowerCase();
    const mimeMap: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4" };
    const mimeType = mimeMap[ext] || "audio/mpeg";

    runFullPipeline(updatedProject, mimeType);

    res.json({ message: "Generation started", projectId });
  });

  app.post(api.projects.render.path, async (req, res) => {
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const activeStates = ['analyzing', 'generating', 'rendering'];
    if (activeStates.includes(project.status)) {
      return res.status(409).json({ message: 'Project is already being processed' });
    }

    await storage.updateProject(projectId, { status: "rendering", progress: 92 });

    renderFinalVideo(project);

    res.json({ message: "Rendering started", projectId });
  });

  app.delete(api.projects.delete.path, async (req, res) => {
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    
    if (project) {
      const clips = await storage.getClips(projectId);
      for (const clip of clips) {
        const clipPath = path.join(OUTPUT_DIR, path.basename(clip.url));
        if (fs.existsSync(clipPath)) {
          try { fs.unlinkSync(clipPath); } catch {}
        }
      }
      if (project.outputVideoUrl) {
        const videoPath = path.join(OUTPUT_DIR, path.basename(project.outputVideoUrl));
        if (fs.existsSync(videoPath)) {
          try { fs.unlinkSync(videoPath); } catch {}
        }
      }
      if (project.originalAudioUrl) {
        const audioPath = path.join(UPLOADS_DIR, project.originalAudioUrl);
        if (fs.existsSync(audioPath)) {
          try { fs.unlinkSync(audioPath); } catch {}
        }
      }
    }

    await storage.deleteClips(projectId);
    await storage.deleteProject(projectId);
    res.status(204).send();
  });

  return httpServer;
}

async function runFullPipeline(project: Project, mimeType: string = "audio/mpeg") {
  try {
    await generateAIClips(project, mimeType);
    const updatedProject = await storage.getProject(project.id);
    if (updatedProject && updatedProject.status === "ready_to_render") {
      await renderFinalVideo(updatedProject);
    }
  } catch (err) {
    console.error("Pipeline failed:", err);
    await storage.updateProject(project.id, { status: "failed" });
  }
}

async function generateAIClips(project: Project, mimeType: string = "audio/mpeg") {
  try {
    const provider = getVisualProvider();
    const audioPath = path.join(UPLOADS_DIR, project.originalAudioUrl);
    const audioData = fs.readFileSync(audioPath);

    await storage.updateProject(project.id, { status: "analyzing", progress: 5 });

    const userPrompt = project.prompt?.trim() || "";

    const analysis: AnalysisResult = await provider.analyzeAudio({
      audioData,
      mimeType,
      userPrompt,
    });

    const finalPrompt = analysis.visualPrompt || userPrompt || "Cinematic abstract music video with flowing light patterns, deep atmospheric colors, smooth organic motion";

    await storage.updateProject(project.id, { 
      prompt: finalPrompt,
      lyrics: analysis.transcription || "",
      mood: analysis.mood || "",
      status: "generating",
      progress: 10,
    });

    console.log(`[${provider.name}] Analysis complete for project ${project.id}. Mood: ${analysis.mood}. Auto-style: ${!userPrompt}`);

    const isHighQuality = project.quality === "high";
    const clipDuration = isHighQuality ? 4 : 5;
    const totalClips = Math.ceil((project.duration || 30) / clipDuration);
    
    await storage.updateProject(project.id, { totalClips });
    await storage.deleteClips(project.id);

    const sections = analysis.sections || [];
    
    for (let i = 0; i < totalClips; i++) {
      const progressPercent = Math.round(10 + (80 * (i / totalClips)));
      const clipPosition = i / totalClips;
      
      let sectionHint = "";
      for (const section of sections) {
        const startPct = (section.startPercent || 0) / 100;
        const endPct = (section.endPercent || 100) / 100;
        if (clipPosition >= startPct && clipPosition <= endPct) {
          sectionHint = section.visualHint || section.name || "";
          break;
        }
      }

      const clipPrompt = sectionHint
        ? `${finalPrompt}. Current section: ${sectionHint}. Clip ${i + 1} of ${totalClips}. ${analysis.mood} mood, ${analysis.energy || 'medium'} energy.`
        : `${finalPrompt}. Clip ${i + 1} of ${totalClips}, position ${Math.round(clipPosition * 100)}% through the song. ${analysis.mood} mood.`;

      try {
        const frame = await provider.generateFrame({
          prompt: clipPrompt,
          clipIndex: i,
          totalClips,
          mood: analysis.mood,
          energy: analysis.energy,
          quality: isHighQuality ? "high" : "fast",
          sectionHint,
        });

        const base64Data = frame.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
        
        const imageFilename = `image_${project.id}_${i}_${randomUUID()}.png`;
        const imagePath = path.join(OUTPUT_DIR, imageFilename);
        fs.writeFileSync(imagePath, base64Data, 'base64');

        const videoFilename = `clip_${project.id}_${i}_${randomUUID()}.mp4`;
        const videoPath = path.join(OUTPUT_DIR, videoFilename);

        const resolution = `${frame.width}x${frame.height}`;
        const crf = isHighQuality ? '18' : '23';

        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(imagePath)
            .loop(clipDuration)
            .inputFormat('image2')
            .size(resolution)
            .outputOptions([
              '-c:v libx264',
              '-pix_fmt yuv420p',
              '-r 30',
              '-t', String(clipDuration),
              '-tune stillimage',
              '-crf', crf,
            ])
            .save(videoPath)
            .on('end', () => {
              try { fs.unlinkSync(imagePath); } catch {}
              resolve();
            })
            .on('error', (err) => reject(err));
        });

        await storage.createClip({
          projectId: project.id,
          url: `/generated/${videoFilename}`,
          promptUsed: clipPrompt,
          duration: clipDuration,
          sequenceOrder: i,
          status: "generated"
        });

        await storage.updateProject(project.id, { 
          progress: progressPercent, 
          generatedClips: i + 1 
        });

        console.log(`Clip ${i + 1}/${totalClips} generated for project ${project.id}`);

      } catch (clipErr) {
        console.error(`Failed to generate clip ${i}:`, clipErr);
        const videoFilename = `clip_${project.id}_${i}_${randomUUID()}.mp4`;
        const videoPath = path.join(OUTPUT_DIR, videoFilename);
        
        await createFallbackClip(videoPath, clipDuration, isHighQuality ? '1920x1080' : '1280x720', i, totalClips);

        await storage.createClip({
          projectId: project.id,
          url: `/generated/${videoFilename}`,
          promptUsed: "Fallback visual",
          duration: clipDuration,
          sequenceOrder: i,
          status: "generated"
        });

        await storage.updateProject(project.id, { 
          progress: progressPercent, 
          generatedClips: i + 1 
        });
      }
    }

    await storage.updateProject(project.id, { status: "ready_to_render", progress: 90 });
  } catch (err) {
    console.error("AI Generation failed:", err);
    await storage.updateProject(project.id, { status: "failed" });
  }
}

async function createFallbackClip(outputPath: string, duration: number, size: string, index: number, total: number): Promise<void> {
  const hue = Math.round((index / total) * 360);
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=black:s=${size}:d=${duration}`)
      .inputOptions(['-f lavfi'])
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-r 30',
        '-t', String(duration),
        '-crf 23',
        '-vf', `drawbox=x=0:y=0:w=iw:h=ih:c=0x${hue.toString(16).padStart(2,'0')}2040@0.3:t=fill`,
      ])
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

async function renderFinalVideo(project: Project) {
  try {
    await storage.updateProject(project.id, { status: "rendering", progress: 92 });

    const clips = await storage.getClips(project.id);
    if (clips.length === 0) {
      throw new Error("No clips to render");
    }

    const outputFilename = `final_${project.id}_${randomUUID()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);
    const audioPath = path.join(UPLOADS_DIR, project.originalAudioUrl);
    
    const listFilename = path.join(OUTPUT_DIR, `list_${project.id}.txt`);
    const fileContent = clips.map(c => `file '${path.join(OUTPUT_DIR, path.basename(c.url))}'`).join('\n');
    fs.writeFileSync(listFilename, fileContent);

    console.log(`Starting render for project ${project.id} with ${clips.length} clips`);

    await storage.updateProject(project.id, { progress: 95 });

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      
      cmd.input(listFilename)
         .inputOptions(['-f concat', '-safe 0']);
         
      cmd.input(audioPath);
      
      cmd.outputOptions([
        '-c:v libx264',
        '-c:a aac',
        '-map 0:v:0',
        '-map 1:a:0',
        '-shortest',
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ])
      .save(outputPath)
      .on('end', () => {
        try { fs.unlinkSync(listFilename); } catch {}
        resolve();
      })
      .on('error', (err) => {
         console.error("FFmpeg error:", err);
         reject(err);
      });
    });

    await storage.updateProject(project.id, { 
      status: "completed",
      outputVideoUrl: `/generated/${outputFilename}`,
      progress: 100,
    });
    
    console.log(`Render complete for project ${project.id}`);

  } catch (err) {
    console.error("Rendering failed:", err);
    await storage.updateProject(project.id, { status: "failed" });
  }
}
