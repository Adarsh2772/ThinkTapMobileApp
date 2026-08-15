/** Structured buckets from POST /api/v1/transcripts/analyze */
export type TranscriptAnalysis = {
  thought: string;
  sourceOfInspiration: string;
  potentialValue: string;
  expansionPaths: string;
  connectedThoughts: string;
};

export type Idea = {
  id: string;
  userId: string;
  title: string;
  category: string;
  summary: string;
  transcript: string;
  aiStory: string | null;
  /** AI analysis of the raw transcript (optional for older saved ideas). */
  analysis?: TranscriptAnalysis | null;
  audioUri: string;
  durationSec: number;
  /** ISO / Whisper language code of the spoken audio (auto-detected or OS locale). */
  language: string;
  /** live = Whisper STT, demo = sample text, device = OS speech recognition */
  transcriptSource: 'live' | 'demo' | 'device';
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
};

export type AuthSession = {
  user: User;
  token: string;
};

export type AiEnrichment = {
  title: string;
  category: string;
  summary: string;
  transcript: string;
  aiStory: string | null;
  /** Auto-detected spoken language (ISO-639-1 / Whisper code). */
  detectedLanguage: string;
};

export type ProcessingStage =
  | 'uploading'
  | 'transcribing'
  | 'extracting'
  | 'summarizing'
  | 'saving'
  | 'done'
  | 'error';
