import { enrichIdeaFromAudio, enrichIdeaFromDeviceTranscript } from '@/src/services/aiService';
import { analyzeTranscript } from '@/src/services/transcriptAnalysisService';
import type { AppLanguageCode } from '@/src/i18n/languages';
import type { Idea, TranscriptAnalysis } from '@/src/types';
import { createId } from '@/src/utils/format';

export type PendingCapture = {
  audioUri: string;
  durationSec: number;
  transcript: string;
  speechLocale: string;
};

type ProcessArgs = {
  userId: string;
  pending: PendingCapture;
  languageCode: AppLanguageCode;
  onStage?: (stage: 'uploading' | 'transcribing' | 'extracting' | 'summarizing' | 'saving') => void;
};

/**
 * Runs the post-capture pipeline (STT/LLM + persist) without UI/navigation.
 */
export async function processPendingRecording({
  userId,
  pending,
  languageCode,
  onStage,
}: ProcessArgs): Promise<Idea> {
  const { audioUri, durationSec, transcript, speechLocale } = pending;
  const deviceTranscript = (transcript ?? '').trim();

  if (!deviceTranscript && !audioUri) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  onStage?.('uploading');

  const reportStage = (s: 'transcribing' | 'extracting' | 'summarizing') => {
    if (s !== 'summarizing') onStage?.(s);
  };

  const enrichment = deviceTranscript
    ? enrichIdeaFromDeviceTranscript({
        transcript: deviceTranscript,
        speechLocale,
        onStage: reportStage,
      })
    : await enrichIdeaFromAudio({
        audioUri,
        durationSec,
        languageCode,
        onStage: reportStage,
      });

  onStage?.('summarizing');
  let analysis: TranscriptAnalysis | null = null;
  let summary = enrichment.summary;
  try {
    analysis = await analyzeTranscript(enrichment.transcript);
    summary = analysis.thought || enrichment.summary;
  } catch (analyzeError) {
    console.warn('Transcript analyze failed; using local summary', analyzeError);
  }

  onStage?.('saving');
  const now = new Date().toISOString();
  return {
    id: createId(),
    userId,
    title: enrichment.title,
    category: enrichment.category,
    summary,
    transcript: enrichment.transcript,
    aiStory: enrichment.aiStory,
    analysis,
    audioUri,
    durationSec,
    language: enrichment.detectedLanguage,
    transcriptSource: enrichment.source,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}
