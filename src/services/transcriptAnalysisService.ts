import type { TranscriptAnalysis } from '@/src/types';

const DEFAULT_ANALYZE_URL = 'https://thinktapai.shastrarth.in/api/v1/transcripts/analyze';

type ApiResponse = {
  expansion_paths?: string;
  source_of_inspiration?: string;
  thought?: string;
  potential_value?: string;
  connected_thoughts?: string;
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
    thought: asText(json.thought),
    sourceOfInspiration: asText(json.source_of_inspiration),
    potentialValue: asText(json.potential_value),
    expansionPaths: asText(json.expansion_paths),
    connectedThoughts: asText(json.connected_thoughts),
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
