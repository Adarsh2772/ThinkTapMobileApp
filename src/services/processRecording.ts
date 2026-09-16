import {
  emptySpeechEnrichment,
  enrichIdeaFromAudio,
  enrichIdeaFromDeviceTranscript,
  isCloudSttAvailable,
  looksLikeWhisperHallucination,
  stripSpokenCommands,
  type EnrichmentResult,
} from '@/src/services/aiService';
import { analyzeTranscript } from '@/src/services/transcriptAnalysisService';
import { hasIndicScript, type AppLanguageCode } from '@/src/i18n/languages';
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
   * WHY translation now happens here, before analysis/title/summary:
   * previously only the "Thought" (transcript) field was translated, further
   * down the pipeline. The title, the AI Core Insight summary, and the
   * "aiStory" text are all generated from the *original* spoken-language
   * transcript, so they stayed in Hindi/Tamil/whatever was spoken even after
   * the Thought itself was correctly showing English. Translating first and
   * building everything else from the English text fixes all of them in one
   * place instead of patching each field separately.
   *
   * WHY the detected language is passed in: deciding "does this need
   * translating" from script/word-guessing alone only ever covered Hindi and
   * Marathi. Tamil, Telugu, Gujarati, Kannada, and every other supported
   * language spoken by the user was silently left untranslated. Whisper
   * already tells us what language was spoken, so that becomes the source of
   * truth - any non-English detected language gets translated, no matter
   * which script or words it uses.
   */
  const rawEnglishTranscript = await toEnglish(enrichment.transcript, enrichment.detectedLanguage);
  /**
   * WHY stripped again here, after translation: `stripSpokenCommands` already
   * ran once on the original-language transcript inside `aiService.ts`. This
   * second pass is a safety net for a command spoken in a script the first
   * pass's patterns don't cover, or one whose punctuation happened to defeat
   * the regex - better to strip nothing twice than to let "hey think tap
   * pause" survive into the saved Thought, which is exactly what a QA report
   * caught.
   */
  const englishTranscript = stripSpokenCommands(rawEnglishTranscript);

  // Title, summary and aiStory are short strings the same finalize step
  // generated in the original spoken language - translate each the same way.
  // toEnglish() is a no-op (and cheap) whenever the text is already English.
  const [rawEnglishTitle, rawEnglishSummary, rawEnglishAiStory] = await Promise.all([
    toEnglish(enrichment.title, enrichment.detectedLanguage),
    toEnglish(enrichment.summary, enrichment.detectedLanguage),
    toEnglish(enrichment.aiStory, enrichment.detectedLanguage),
  ]);
  const englishTitle = stripSpokenCommands(rawEnglishTitle);
  const englishSummary = stripSpokenCommands(rawEnglishSummary);
  const englishAiStory = stripSpokenCommands(rawEnglishAiStory);

  onStage?.('summarizing');
  let analysis: TranscriptAnalysis | null = null;
  try {
    if (englishTranscript.trim()) {
      // Analyze the English transcript, not the original-language one, so
      // "AI Core Insight" comes back in English instead of needing its own
      // translation pass afterwards.
      analysis = await analyzeTranscript(englishTranscript);
    }
  } catch (analyzeError) {
    console.warn('Transcript analyze failed; using local summary', analyzeError);
  }

  const analysisThought = analysis?.thought?.trim() ?? '';
  const keepAnalysisSummary =
    Boolean(analysisThought) &&
    !(hasIndicScript(englishTranscript) && !hasIndicScript(analysisThought));

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
    title: englishTitle,
    category,
    summary: keepAnalysisSummary ? analysisThought : englishSummary,
    transcript: englishTranscript,
    aiStory: englishAiStory,
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
