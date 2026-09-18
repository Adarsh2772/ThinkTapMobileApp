/**
 * WHY /legacy specifically: plain 'expo-file-system' in this SDK version
 * is the new File/Directory API, and copyAsync/cacheDirectory are the old
 * function-based API's names. Importing them from the plain path still
 * resolves at compile time but triggers a deprecation shim that throws at
 * call time instead of just warning - which is what surfaced as "Could not
 * export" in testing. The rest of this codebase (audioStorage.ts) already
 * standardized on /legacy for exactly this reason; this file just hadn't
 * followed that pattern yet.
 */
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { Idea } from '@/src/types';

/**
 * Exports a set of search results as a PDF, showing exactly the three fields
 * the spec defines as a thought's display shape - Source, Thought, AI Core
 * Insight - plus the thought ID. Nothing else: no audio, no raw metadata, no
 * fields belonging to the deferred AI Intelligence layer.
 *
 * WHY expo-print + expo-sharing rather than a from-scratch PDF library: both
 * are the standard Expo-maintained way to produce and hand off a file on
 * this platform, and expo-print renders from plain HTML, so the report layout
 * is just a template string - nothing exotic to maintain. Neither is
 * currently a project dependency; see the note this ships with for the
 * install command.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * WHY this specific fallback chain: the backend is moving from a five-field
 * shape to a proper three-field one (source_of_inspiration, thought,
 * ai_core_insight - see the backend fix delivered alongside this). Until an
 * idea has been reprocessed under the new shape, analysis.thought is what the
 * app already treats as the Insight display value; idea.summary is the
 * offline/local fallback used when no analysis exists at all. Both are tried
 * so the export looks right for ideas saved before and after the backend
 * change, without needing every idea to be re-analyzed first.
 */
function coreInsightFor(idea: Idea): string {
  return (idea.analysis?.thought || idea.summary || '').trim();
}

function thoughtCardHtml(idea: Idea): string {
  const source = escapeHtml((idea.analysis?.sourceOfInspiration || '').trim() || '—');
  const thought = escapeHtml((idea.transcript || '').trim() || '—');
  const insight = escapeHtml(coreInsightFor(idea) || '—');
  const id = escapeHtml(idea.id);

  return `
    <div class="card">
      <div class="id">Thought ID: ${id}</div>
      <div class="field">
        <div class="label">Source</div>
        <div class="value">${source}</div>
      </div>
      <div class="field">
        <div class="label">Thought</div>
        <div class="value">${thought}</div>
      </div>
      <div class="field">
        <div class="label">AI Core Insight</div>
        <div class="value">${insight}</div>
      </div>
    </div>
  `;
}

function reportHtml(ideas: Idea[], query: string): string {
  const generatedAt = new Date().toLocaleString();
  const cards = ideas.map(thoughtCardHtml).join('\n');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Roboto, sans-serif; color: #1a1a2e; padding: 24px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
          .id { font-size: 10px; color: #9ca3af; margin-bottom: 10px; }
          .field { margin-bottom: 10px; }
          .field:last-child { margin-bottom: 0; }
          .label { font-size: 11px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
          .value { font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>Think Tap — Search Results</h1>
        <div class="meta">
          Query: "${escapeHtml(query)}" · ${ideas.length} thought${ideas.length === 1 ? '' : 's'} · Generated ${escapeHtml(generatedAt)}
        </div>
        ${cards}
      </body>
    </html>
  `;
}

/**
 * Generates the PDF and opens the system share sheet. Throws on failure -
 * callers should catch and show a toast rather than let this throw reach the
 * user unhandled.
 */
export async function exportThoughtsPdf(ideas: Idea[], query: string): Promise<void> {
  if (ideas.length === 0) {
    throw new Error('No results to export.');
  }

  const html = reportHtml(ideas, query);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  // WHY moved rather than shared from the cache path directly: Print writes
  // to a temp cache location with a generic name; giving it a real filename
  // makes the share sheet and the saved file itself readable at a glance.
  const fileName = `thinktap-search-${Date.now()}.pdf`;
  const destination = `${cacheDirectory}${fileName}`;
  await copyAsync({ from: uri, to: destination });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(destination, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share your Think Tap search results',
  });
}
