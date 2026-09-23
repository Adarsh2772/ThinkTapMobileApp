import type { TranscriptAnalysis } from '@/src/types';
import { isSarvamEnabled, sarvamChatJson } from '@/src/services/sarvamChat';

const DEFAULT_ANALYZE_URL = 'https://thinktapai.shastrarth.in/api/v1/transcripts/analyze';

/**
 * WHY only two fields now: the backend endpoint moved from a five-field
 * shape (the deferred AI Intelligence layer's fields) to the V1-spec-
 * correct shape - see the backend's own prompts/transcript_analysis.py
 * for the full reasoning. "thought" is deliberately gone from the
 * response: it would have just been an AI-generated echo of the
 * transcript this app already has verbatim locally as idea.transcript -
 * this app does not need the backend to hand back a second, potentially-
 * drifting copy of the user's own words.
 */
type ApiResponse = {
  source_of_inspiration?: string;
  ai_core_insight?: string;
};

function analyzeUrl(): string {
  const raw = process.env.EXPO_PUBLIC_TRANSCRIPT_ANALYZE_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return DEFAULT_ANALYZE_URL;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mapResponse(json: ApiResponse): TranscriptAnalysis {
  return {
    /**
     * WHY ai_core_insight maps into the `thought` field of this local
     * type: idea/[id].tsx already reads analysis.thought as the primary
     * "AI Core Insight" display text - that mapping was correct before
     * this change and stays correct now, it is simply fed by the new,
     * properly-named backend field instead of the old five-field shape's
     * repurposed "thought" field. Not renamed here to avoid a wider,
     * riskier rename across every screen that already reads
     * analysis.thought.
     */
    thought: asText(json.ai_core_insight),
    sourceOfInspiration: asText(json.source_of_inspiration),
    /**
     * WHY these three stay as empty strings rather than being removed
     * from TranscriptAnalysis entirely: the backend no longer sends them
     * (they belonged to the deferred AI Intelligence layer, not V1's
     * spec), but removing the fields from the type would mean touching
     * every screen that reads them. They already render as an em-dash
     * when empty (see idea/[id].tsx's ANALYSIS_FIELDS rendering), so
     * this degrades gracefully with no UI change required here.
     */
    potentialValue: '',
    expansionPaths: '',
    connectedThoughts: '',
  };
}

export function hasAnalysisContent(analysis: TranscriptAnalysis | null | undefined): boolean {
  if (!analysis) return false;
  return Boolean(
    analysis.thought ||
      analysis.sourceOfInspiration ||
      analysis.potentialValue ||
      analysis.expansionPaths ||
      analysis.connectedThoughts,
  );
}

/**
 * Generate the AI Core Insight with SARVAM (the primary provider per CR).
 *
 * Returns a TranscriptAnalysis on success, or null on any recoverable failure
 * (no key, offline, timeout, bad/empty response) so the caller can fall back
 * to Saarthi.ai. Never throws - a thrown error would defeat the fallback.
 *
 * The two fields V1 exposes are the AI Core Insight (a faithful, non-expansive
 * compression) and the Source of Inspiration (what sparked the thought). Same
 * shape the Saarthi.ai backend returns, so the rest of the app is unchanged.
 */
async function analyzeWithSarvam(cleaned: string): Promise<TranscriptAnalysis | null> {
  if (!isSarvamEnabled()) return null;

  const system =
    'You analyse a single personal voice note (already in English) and return ONLY a JSON object ' +
    'with exactly these keys: source_of_inspiration, ai_core_insight.\n' +
    '- source_of_inspiration: what sparked this thought - the trigger, moment or observation the ' +
    'speaker names. If they do not say, use an empty string. Use their own wording; do not invent.\n' +
    '- ai_core_insight: a FAITHFUL, NON-EXPANSIVE compression of what the speaker actually said - a ' +
    'short, clear restatement. Do NOT add new ideas, opportunities, directions or applications the ' +
    'speaker did not voice. One or two sentences. If the thought is thin, restate it plainly.\n' +
    'Return only the JSON object, no other text.';

  const parsed = await sarvamChatJson<{
    source_of_inspiration?: string;
    ai_core_insight?: string;
  }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: cleaned.slice(0, 4000) },
    ],
    { maxTokens: 512, timeoutMs: 20_000 },
  );

  if (!parsed) return null;
  const insight = asText(parsed.ai_core_insight);
  const source = asText(parsed.source_of_inspiration);
  // Treat an empty insight as a failure so we fall back rather than store blank.
  if (!insight && !source) return null;

  return {
    thought: insight,
    sourceOfInspiration: source,
    potentialValue: '',
    expansionPaths: '',
    connectedThoughts: '',
  };
}

/** Saarthi.ai (existing backend) analyze call - the FALLBACK provider. */
async function analyzeWithSaarthi(cleaned: string): Promise<TranscriptAnalysis> {
  const response = await fetch(analyzeUrl(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transcript: cleaned }),
  });

  if (!response.ok) {
    let detail = `Analyze failed (${response.status})`;
    try {
      const errJson = (await response.json()) as { detail?: unknown };
      if (typeof errJson.detail === 'string') detail = errJson.detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as ApiResponse;
  return mapResponse(json);
}

/**
 * Generate the AI Core Insight.
 *
 * Provider order per CR: SARVAM primary, Saarthi.ai fallback.
 *   1. Try Sarvam. If it returns a usable insight, use it.
 *   2. On any recoverable Sarvam failure (no key, timeout, network, empty or
 *      invalid response), fall back to the existing Saarthi.ai backend.
 * All existing Saarthi.ai behaviour, response parsing and error handling is
 * preserved - it is simply now the second choice rather than the only one.
 */
export async function analyzeTranscript(transcript: string): Promise<TranscriptAnalysis> {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

  // 1) Primary: Sarvam. analyzeWithSarvam never throws - null means "fall back".
  try {
    const sarvam = await analyzeWithSarvam(cleaned);
    if (sarvam) return sarvam;
  } catch {
    // Defensive: even an unexpected throw must not block the fallback.
  }

  // 2) Fallback: Saarthi.ai (existing backend). This may throw, exactly as
  // before, and the caller's existing error handling deals with it.
  return analyzeWithSaarthi(cleaned);
}
