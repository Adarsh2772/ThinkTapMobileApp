import {
  enrichIdeaFromAudio,
  enrichIdeaFromDeviceTranscript,
  isCloudSttAvailable,
  type EnrichmentResult,
} from '@/src/services/aiService';
import { analyzeTranscript } from '@/src/services/transcriptAnalysisService';
import { hasIndicScript, type AppLanguageCode } from '@/src/i18n/languages';
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

function localEnrichment(
  pending: PendingCapture,
  languageCode: AppLanguageCode,
): EnrichmentResult {
  const deviceTranscript = (pending.transcript ?? '').trim();
  if (deviceTranscript) {
    return enrichIdeaFromDeviceTranscript({
      transcript: deviceTranscript,
      speechLocale: pending.speechLocale,
    });
  }
  return {
    transcript: '',
    title: 'Voice note',
    category: 'Business',
    summary: 'Your recording was saved. The transcript will appear once transcription is available.',
    aiStory: null,
    detectedLanguage: languageCode,
    source: 'demo',
  };
}

function ideaFromEnrichment(
  userId: string,
  pending: PendingCapture,
  enrichment: EnrichmentResult,
  analysis: TranscriptAnalysis | null,
): Idea {
  const now = new Date().toISOString();
  return {
    id: createId(),
    userId,
    title: enrichment.title,
    category: enrichment.category,
    summary: analysis?.thought || enrichment.summary,
    transcript: enrichment.transcript,
    aiStory: enrichment.aiStory,
    analysis,
    audioUri: pending.audioUri,
    durationSec: pending.durationSec,
    language: enrichment.detectedLanguage,
    transcriptSource: enrichment.source,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Persist the take immediately so transcription failures cannot drop it. */
export function buildLocalIdea(
  userId: string,
  pending: PendingCapture,
  languageCode: AppLanguageCode,
): Idea {
  return ideaFromEnrichment(userId, pending, localEnrichment(pending, languageCode), null);
}

export async function enrichPendingRecording(
  pending: PendingCapture,
  languageCode: AppLanguageCode,
  onStage?: ProcessArgs['onStage'],
): Promise<Partial<Idea> | null> {
  const deviceTranscript = (pending.transcript ?? '').trim();
  if (!deviceTranscript && !pending.audioUri) return null;

  const reportStage = (s: 'transcribing' | 'extracting' | 'summarizing') => {
    if (s !== 'summarizing') onStage?.(s);
  };

  onStage?.('uploading');
  const canUseCloud = Boolean(pending.audioUri) && isCloudSttAvailable();
  const enrichment = canUseCloud
    ? await enrichIdeaFromAudio({
        audioUri: pending.audioUri,
        durationSec: pending.durationSec,
        languageCode,
        onStage: reportStage,
      })
    : deviceTranscript
      ? enrichIdeaFromDeviceTranscript({
          transcript: deviceTranscript,
          speechLocale: pending.speechLocale,
          onStage: reportStage,
        })
      : await enrichIdeaFromAudio({
          audioUri: pending.audioUri,
          durationSec: pending.durationSec,
          languageCode,
          onStage: reportStage,
        });

  onStage?.('summarizing');
  let analysis: TranscriptAnalysis | null = null;
  try {
    if (enrichment.transcript.trim()) {
      analysis = await analyzeTranscript(enrichment.transcript);
    }
  } catch (analyzeError) {
    console.warn('Transcript analyze failed; using local summary', analyzeError);
  }

  const analysisThought = analysis?.thought?.trim() ?? '';
  const keepAnalysisSummary =
    Boolean(analysisThought) &&
    !(hasIndicScript(enrichment.transcript) && !hasIndicScript(analysisThought));

  return {
    title: enrichment.title,
    category: enrichment.category,
    summary: keepAnalysisSummary ? analysisThought : enrichment.summary,
    transcript: enrichment.transcript,
    aiStory: enrichment.aiStory,
    analysis: keepAnalysisSummary ? analysis : null,
    language: enrichment.detectedLanguage,
    transcriptSource: enrichment.source,
  };
}

/**
 * Runs the post-capture pipeline (STT/LLM + persist) without UI/navigation.
 * A take with audio or a device transcript is always saved, even if Groq is down.
 */
export async function processPendingRecording({
  userId,
  pending,
  languageCode,
  onStage,
}: ProcessArgs): Promise<Idea> {
  const deviceTranscript = (pending.transcript ?? '').trim();
  if (!deviceTranscript && !pending.audioUri) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  try {
    const patch = await enrichPendingRecording(pending, languageCode, onStage);
    if (patch) {
      onStage?.('saving');
      return {
        ...ideaFromEnrichment(userId, pending, localEnrichment(pending, languageCode), null),
        ...patch,
      };
    }
  } catch (error) {
    console.warn('Enrichment failed; saving the recording locally', error);
  }

  onStage?.('saving');
  return buildLocalIdea(userId, pending, languageCode);
}
