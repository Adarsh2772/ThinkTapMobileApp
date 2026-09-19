import type { TranscriptAnalysis } from '@/src/types';

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
 * POST raw recording transcript → structured statement buckets.
 * https://thinktapai.shastrarth.in/api/v1/transcripts/analyze
 */
export async function analyzeTranscript(transcript: string): Promise<TranscriptAnalysis> {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    throw new Error('No speech detected in this recording. Try speaking more clearly.');
  }

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
