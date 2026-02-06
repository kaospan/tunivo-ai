# Tunivo Studio

## Overview

**Tunivo Studio** is a subscription-based AI platform that transforms music into full-length, synchronized visual videos. Users upload a music file (MP3/WAV/M4A), optionally provide a visual style prompt, and the app automatically analyzes the audio, generates AI-powered video clips matching the song's mood and sections, stitches them together using FFmpeg, and produces a downloadable MP4 music video synchronized with the original audio.

**Internal tagline**: "Turn music into motion."

**Key feature**: The visual style prompt is optional — leaving it blank triggers automatic AI-driven style selection based on the music's tempo, mood, energy, and structure.

The app follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for persistence via Drizzle ORM.

## Audit Summary (2026-02-06)

### What Existed Before
- Full project CRUD with database persistence (projects + clips tables)
- Audio upload via multer with metadata parsing (duration, BPM)
- AI analysis pipeline using Gemini (mood, energy, sections, auto-style)
- AI image generation + FFmpeg clip-to-video conversion
- Final video rendering (FFmpeg concat + audio sync)
- Home page with project list and create modal
- Project detail page with progress tracking, polling, and status badges
- AudioPlayer component (WaveSurfer.js) with play/pause, seek, restart, volume, loop
- VideoPromptPlayer component with audio-synchronized clip playback
- CreateProjectModal with file upload, title, visual prompt, quality toggle
- Unused AudioVisualizer component (replaced by AudioPlayer)

### What Was Added
- **Tunivo branding**: App title, meta tags, OG tags, UI text updated across all pages
- **Provider adapter interface** (`server/providers/`): Abstracted AI generation behind `IVisualProvider` interface with `GeminiVisualProvider` implementation. New providers (Stable Diffusion, Runway, etc.) can be added by implementing the interface.
- **Performance mode UI toggle**: Visual toggle in ProjectDetail header showing Fast/HQ modes (non-functional prep for subscription tiers)
- **Cleanup**: Removed unused `AudioVisualizer.tsx` component

### Audio Deduplication & Takes (2026-02-06)
- **File deduplication**: Uploading the same audio file (identical SHA-256 hash) doesn't create a duplicate — the app navigates to the existing project instead, deletes the duplicate upload
- **Take system**: Each regeneration on a project increments the `takeNumber` counter. Displayed in ProjectDetail header when > 1
- **Schema additions**: `audioHash` (text) and `takeNumber` (integer, default 1) columns on projects table
- **Storage method**: `getProjectByAudioHash(hash)` for fast dedup lookup
- **Failed project actions**: Home page project cards for failed projects show Retry and Delete action buttons inline

### What Is Ready for Next Phase
- **AI video providers**: Swap or add providers by implementing `IVisualProvider` in `server/providers/`
- **Credits monetization**: Provider adapter already supports quality-based differentiation
- **Subscription tiers**: Performance mode UI toggle in place, ready to wire to billing logic

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript (pure SPA)
- **Routing**: `wouter` for lightweight client-side routing
- **State/Data Fetching**: `@tanstack/react-query` for server state management with polling support (projects poll every 2s while in active processing states)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Styling**: Tailwind CSS with CSS variables for theming; dark, neon-accented theme (purple primary, cyan secondary). Custom fonts: DM Sans (body), Space Grotesk (display), Fira Code (mono)
- **Audio Visualization**: `wavesurfer.js` for waveform display
- **Animations**: `framer-motion` for page transitions and micro-interactions
- **Build Tool**: Vite with React plugin, path aliases (`@/` → `client/src/`, `@shared/` → `shared/`)
- **Key Pages**: Home (project list), ProjectDetail (view/control generation pipeline), 404

### Backend
- **Framework**: Express.js running on Node.js with TypeScript (via `tsx`)
- **API Pattern**: RESTful JSON API under `/api/` prefix. Routes defined in `server/routes.ts` with shared contract in `shared/routes.ts`
- **File Uploads**: `multer` with disk storage to `uploads/` directory
- **Media Processing**: `fluent-ffmpeg` (FFmpeg wrapper) for video concatenation, audio/video sync, rendering
- **Audio Analysis**: `music-metadata` for parsing audio metadata (duration, BPM). Gemini AI for deep mood/structure analysis.
- **AI Visual Generation**: Provider adapter pattern (`server/providers/`) with `IVisualProvider` interface. Current implementation: `GeminiVisualProvider` using Replit AI Integrations.
- **Generated Output**: Stored in `client/public/generated/` and served statically at `/generated/`
- **Development**: Vite dev server middleware (HMR) in development mode; static file serving in production
- **Build**: Custom `script/build.ts` using esbuild for server bundle + Vite for client bundle

### Provider Adapter Interface (`server/providers/`)
- `types.ts` — Defines `IVisualProvider`, `AnalysisResult`, `GenerateFrameOptions`, `VisualFrame`
- `gemini-provider.ts` — Gemini implementation of `IVisualProvider`
- `index.ts` — Factory with `getVisualProvider()` and `setVisualProvider()` for swapping providers

### Shared Layer (`shared/`)
- **Schema** (`shared/schema.ts`): Drizzle ORM table definitions for `projects` and `clips` tables, plus Zod schemas via `drizzle-zod`
- **Routes** (`shared/routes.ts`): Typed API contract defining paths, methods, and response schemas

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (connection via `DATABASE_URL` environment variable)
- **Schema Push**: `npm run db:push` uses `drizzle-kit push` to sync schema
- **Tables**:
  - `projects`: id, title, prompt, originalAudioUrl, audioFilename, audioHash, status, quality (fast/high), duration, bpm, lyrics, mood, progress, totalClips, generatedClips, takeNumber, outputVideoUrl, createdAt
  - `clips`: id, projectId (FK), url, promptUsed, duration, sequenceOrder, status (pending/generated), createdAt
- **Storage Pattern**: `IStorage` interface in `server/storage.ts` with `DatabaseStorage` implementation

### Project Processing Pipeline
Statuses flow automatically after creation:
1. **analyzing** — AI analyzes audio for mood, tempo, structure, generates visual prompt (if blank)
2. **generating** — Creating AI video clips via provider adapter + FFmpeg still-to-video conversion
3. **ready_to_render** — All clips generated, auto-transitions to rendering
4. **rendering** — FFmpeg stitching clips + audio into final MP4
5. **completed** — Final video ready for download
6. **failed** — Error occurred at any stage (retry available)

### Key Design Decisions
- **Auto-style when prompt is blank**: AI analyzes audio to infer mood, energy, genre, and section structure
- **One-click pipeline**: Creating a project triggers the full analyze → generate → render pipeline
- **Provider-agnostic architecture**: AI generation uses adapter pattern — no hardcoded provider
- **Quality modes**: "Fast" (1280x720, CRF 23) and "High Quality" (1920x1080, CRF 18)
- **Progress tracking**: Real-time progress percentage and clip count via polling
- **Fallback clips**: If AI image generation fails, a solid-color fallback keeps the pipeline running
- **Cleanup on delete**: Removes associated clips, generated files, and uploaded audio

## External Dependencies

- **PostgreSQL**: Primary database via `DATABASE_URL`
- **FFmpeg**: System PATH for video processing via `fluent-ffmpeg`
- **Gemini AI (via Replit AI Integrations)**: Audio analysis and image generation via `AI_INTEGRATIONS_GEMINI_API_KEY` and `AI_INTEGRATIONS_GEMINI_BASE_URL`
- **Google Fonts**: DM Sans, Space Grotesk, Fira Code loaded via CDN
- **Replit Plugins**: `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`
