export type DetectedLanguage = {
  code?: string;
  name?: string;
  confidence?: number;
};

export type SpeechToTextResult = {
  success: true;
  transcription: string;
  language?: DetectedLanguage;
  audio?: {
    duration?: number;
  };
};

export type SpeechToTextError = {
  success?: false;
  error: string;
};

export type SpeechUploadOptions = {
  audioUri: string;
  preferredLanguage?: string;
  conversationId?: string;
};
