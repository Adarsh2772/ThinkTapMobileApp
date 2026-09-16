import {
  emptySpeechEnrichment,
  enrichIdeaFromAudio,
  enrichIdeaFromDeviceTranscript,
  isCloudSttAvailable,
  looksLikeWhisperHallucination,
  titleFromTranscript,
  type EnrichmentResult,
} from '@/src/services/aiService';
import { analyzeTranscript } from '@/src/services/transcriptAnalysisService';
import type { AppLanguageCode } from '@/src/i18n/languages';
import { normalizeCategory } from '@/src/theme/tokens';
import { categorizeWithLlm } from '@/src/services/categorizeService';
import { toEnglish } from '@/src/services/englishPass';
import type { Idea, TranscriptAnalysis } from '@/src/types';
import { useSettingsStore } from '@/src/store/settingsStore';
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
  _languageCode: AppLanguageCode,
): EnrichmentResult {
  const deviceTranscript = (pending.transcript ?? '').trim();
  if (deviceTranscript && !looksLikeWhisperHallucination(deviceTranscript)) {
    return enrichIdeaFromDeviceTranscript({
      transcript: deviceTranscript,
      speechLocale: pending.speechLocale,
    });
  }
  return emptySpeechEnrichment();
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
    category: normalizeCategory(enrichment.category),
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
  let enrichment: EnrichmentResult;
  try {
    if (canUseCloud) {
      enrichment = await enrichIdeaFromAudio({
        audioUri: pending.audioUri,
        durationSec: pending.durationSec,
        languageCode,
        // The transcription language chosen in Settings - see whisperTranscribe.
        speechLocale: pending.speechLocale,
        /**
         * WHY false: Whisper's translate endpoint is markedly weaker than its
         * transcribe endpoint. Asked to translate, it transliterates when
         * unsure - "Ashi Banwa Banwi" came back spelled out rather than
         * rendered in English, and that is not searchable.
         *
         * Transcribing in the spoken language is what Whisper is best at, and
         * the LLM translation pass that follows is a text-to-text job where
         * a language model is far stronger than a speech model. Two steps,
         * each doing what it is good at.
         */
        translateToEnglish: false,
        onStage: reportStage,
      });
    } else if (deviceTranscript) {
      enrichment = enrichIdeaFromDeviceTranscript({
        transcript: deviceTranscript,
        speechLocale: pending.speechLocale,
        onStage: reportStage,
      });
    } else {
      enrichment = await enrichIdeaFromAudio({
        audioUri: pending.audioUri,
        durationSec: pending.durationSec,
        languageCode,
        // The transcription language chosen in Settings - see whisperTranscribe.
        speechLocale: pending.speechLocale,
        /**
         * WHY false: Whisper's translate endpoint is markedly weaker than its
         * transcribe endpoint. Asked to translate, it transliterates when
         * unsure - "Ashi Banwa Banwi" came back spelled out rather than
         * rendered in English, and that is not searchable.
         *
         * Transcribing in the spoken language is what Whisper is best at, and
         * the LLM translation pass that follows is a text-to-text job where
         * a language model is far stronger than a speech model. Two steps,
         * each doing what it is good at.
         */
        translateToEnglish: false,
        onStage: reportStage,
      });
    }
  } catch (error) {
    console.warn('Enrichment failed; using device or empty speech', error);
    enrichment = deviceTranscript
      ? enrichIdeaFromDeviceTranscript({
          transcript: deviceTranscript,
          speechLocale: pending.speechLocale,
          onStage: reportStage,
        })
      : emptySpeechEnrichment();
  }

  if (looksLikeWhisperHallucination(enrichment.transcript, enrichment.detectedLanguage)) {
    enrichment =
      deviceTranscript && !looksLikeWhisperHallucination(deviceTranscript)
        ? enrichIdeaFromDeviceTranscript({
            transcript: deviceTranscript,
            speechLocale: pending.speechLocale,
          })
        : emptySpeechEnrichment();
  }

  if (!enrichment.transcript.trim()) {
    enrichment = emptySpeechEnrichment();
  }

  /**
   * WHY translation runs BEFORE analysis, not after: analyzeTranscript used to
   * receive enrichment.transcript - the raw Whisper output in the spoken
   * language - so a Hindi recording produced a Hindi "AI Core Insight" even
   * though the Thought above it was already in English. Title, Thought and AI
   * Core Insight are meant to read as one language throughout a saved idea;
   * the fix is to translate first and build everything else from that same
   * English text.
   *
   * WHY the detected language is passed to toEnglish: deciding "does this need
   * translating" from script/word-guessing alone only ever covered Hindi and
   * Marathi. Tamil, Telugu, Gujarati, Kannada and every other supported
   * language spoken by the user was silently left untranslated. Whisper
   * already tells us what language was spoken, so that becomes the source of
   * truth - any non-English detected language gets translated, no matter
   * which script or words it uses.
   */
  const englishTranscript = await toEnglish(enrichment.transcript, enrichment.detectedLanguage);

  /**
   * WHY the title is regenerated here: titleFromTranscript() runs inside
   * enrichIdeaFromAudio / enrichIdeaFromDeviceTranscript against the raw
   * Whisper text, before translation exists. enrichment.title was therefore
   * always in the spoken language even once the Thought below it read in
   * English - the saved idea's own heading was the one thing left
   * untranslated. Re-deriving it from englishTranscript keeps title, Thought
   * and AI Core Insight consistently in one language.
   */
  const title = englishTranscript.trim()
    ? titleFromTranscript(englishTranscript)
    : enrichment.title;

  onStage?.('summarizing');
  let analysis: TranscriptAnalysis | null = null;
  try {
    if (englishTranscript.trim()) {
      analysis = await analyzeTranscript(englishTranscript);
    }
  } catch (analyzeError) {
    console.warn('Transcript analyze failed; using local summary', analyzeError);
  }

  /**
   * WHY the Indic-script comparison is gone: it existed to catch analysis that
   * came back in a different language than the transcript, which could happen
   * when the transcript was untranslated Hindi and analyzeTranscript answered
   * in English or vice versa. Both sides are now built from the same
   * englishTranscript, so a language mismatch between them cannot occur - the
   * only real failure mode left is analyzeTranscript returning nothing, which
   * the plain truthiness check below already covers.
   */
  const analysisThought = analysis?.thought?.trim() ?? '';
  const keepAnalysisSummary = Boolean(analysisThought);

  /**
   * WHY the LLM categorises here: it needs the finished text, and it must not
   * block the save if it is slow or unreachable. A null result keeps the
   * keyword guess, so a failure downgrades accuracy rather than breaking the
   * thought.
   */
  let category = normalizeCategory(enrichment.category);
  const smart = await categorizeWithLlm(englishTranscript);
  // normalizeCategory() narrows the plain `string` categorizeWithLlm returns
  // back to the exact Category union - it's a no-op when the value is
  // already one of the 7 known names, which it always is here.
  if (smart) category = normalizeCategory(smart);

  return {
    title,
    category,
    summary: keepAnalysisSummary ? analysisThought : enrichment.summary,
    transcript: englishTranscript,
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
