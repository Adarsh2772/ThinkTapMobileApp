export type Idea = {
  id: string;
  userId: string;
  title: string;
  category: string;
  summary: string;
  transcript: string;
  aiStory: string | null;
  audioUri: string;
  durationSec: number;
  language: string;
  /** live = real Whisper STT, demo = sample text without API key */
  transcriptSource: 'live' | 'demo';
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
};

export type ProcessingStage =
  | 'uploading'
  | 'transcribing'
  | 'extracting'
  | 'summarizing'
  | 'saving'
  | 'done'
  | 'error';
