import type { Idea } from '@/src/types';

/** Word spec §8 sorts. Best Match is the default. */
export type SearchSort =
  | 'best_match'
  | 'newest'
  | 'oldest'
  | 'recently_visited'
  | 'dormant_gems';

export const SEARCH_SORTS: { id: SearchSort; label: string }[] = [
  { id: 'best_match', label: 'Best Match' },
  { id: 'newest', label: 'Newest First' },
  { id: 'oldest', label: 'Oldest First' },
  { id: 'recently_visited', label: 'Recently Visited' },
  { id: 'dormant_gems', label: 'Dormant Gems' },
];

const DORMANT_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const DORMANT_MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Phrase variants so different wording still hits the same Human Signal.
 * Matching only — never rewrite the transcript.
 */
const SYNONYMS: Record<string, string[]> = {
  movie: ['film', 'cinema'],
  movies: ['films', 'cinema'],
  film: ['movie', 'cinema'],
  films: ['movies', 'cinema'],
  cinema: ['movie', 'film'],
  bollywood: ['hindi cinema', 'hindi film'],
  song: ['music', 'lyrics', 'track'],
  songs: ['music', 'lyrics'],
  lyrics: ['song', 'words'],
  father: ['dad', 'papa'],
  dad: ['father', 'papa'],
  idea: ['thought', 'concept'],
  thought: ['idea'],
  rain: ['rainy', 'rainfall'],
};

/**
 * WHY split on comma, not space: the previous version split on every
 * space, so each word became its own separate search pill - there was no
 * way to enter a multi-word phrase as one fragment. The client's spec
 * reference shows comma-separated phrases ("Bollywood movie, rain,
 * dialogue about fathers") as the intended input shape. A fragment can
 * still be multi-word after this change - see scoreSignal below for how
 * multi-word fragments are matched word-order-flexibly rather than as one
 * rigid phrase, which is what keeps "Bollywood movie" also finding
 * "movie in Bollywood" working exactly as the spec requires.
 */
export function parseFragments(query: string): string[] {
  return query
    .split(',')
    .map((part) => normalize(part))
    .filter((token) => token.length > 0);
}

export function ellipsize(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function humanSignal(idea: Idea): string {
  return idea.transcript ?? '';
}

export type SearchHit = {
  idea: Idea;
  score: number;
};

/**
 * Search the raw transcript only (Human Signal).
 * Each fragment must match (progressive AND). Synonyms / word order do not change stored text.
 */
export function searchThoughts(
  ideas: Idea[],
  query: string,
  sort: SearchSort,
  now = Date.now(),
): SearchHit[] {
  const fragments = parseFragments(query);
  if (fragments.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const idea of ideas) {
    const signal = normalize(humanSignal(idea));
    if (!signal) continue;
    const scored = scoreSignal(signal, fragments);
    if (scored === null) continue;
    hits.push({ idea, score: scored });
  }

  return orderHits(hits, sort, now);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandFragment(fragment: string): string[] {
  const extras = SYNONYMS[fragment] ?? [];
  return [fragment, ...extras.map((item) => normalize(item))];
}

function containsVariant(signal: string, variant: string): boolean {
  if (!variant) return false;
  if (signal.includes(variant)) return true;
  if (variant.length < 4) return false;
  return signal.split(' ').some((token) => {
    if (token.length < 4) return false;
    return token.startsWith(variant) || variant.startsWith(token);
  });
}

function scoreSignal(signal: string, fragments: string[]): number | null {
  let score = 0;
  for (const fragment of fragments) {
    /**
     * WHY matched word-by-word instead of as one substring: fragments can
     * now be multi-word (comma-separated input, see parseFragments).
     * Requiring the whole phrase to appear adjacent would have broken the
     * spec's explicit requirement that "Bollywood movie" also finds a
     * thought that only ever said "movie in Bollywood" - every word in the
     * fragment must appear somewhere in the signal, in any order, for the
     * fragment to count as matched. A single-word fragment behaves exactly
     * as before this change.
     */
    const words = fragment.split(' ').filter(Boolean);
    let fragmentScore = 0;
    let allWordsFound = true;
    for (const word of words) {
      const variants = expandFragment(word);
      const exactIndex = signal.indexOf(word);
      const synonymHit = variants.slice(1).some((variant) => containsVariant(signal, variant));
      if (exactIndex < 0 && !synonymHit && !containsVariant(signal, word)) {
        allWordsFound = false;
        break;
      }
      if (exactIndex >= 0) {
        fragmentScore += 12 + Math.max(0, 8 - exactIndex / 24);
      } else {
        fragmentScore += 5;
      }
    }
    if (!allWordsFound) return null;
    // Bonus for the exact phrase appearing adjacent, same weighting as
    // a direct substring match had before this change.
    if (words.length > 1 && signal.includes(fragment)) fragmentScore += 6;
    score += fragmentScore;
  }
  return score;
}

function orderHits(hits: SearchHit[], sort: SearchSort, now: number): SearchHit[] {
  const copy = [...hits];
  copy.sort((a, b) => {
    switch (sort) {
      case 'newest':
        return b.idea.createdAt.localeCompare(a.idea.createdAt);
      case 'oldest':
        return a.idea.createdAt.localeCompare(b.idea.createdAt);
      case 'recently_visited':
        return visitedMs(b.idea) - visitedMs(a.idea);
      case 'dormant_gems':
        return dormantRank(a.idea) - dormantRank(b.idea);
      case 'best_match':
      default:
        if (b.score !== a.score) return b.score - a.score;
        return b.idea.createdAt.localeCompare(a.idea.createdAt);
    }
  });

  if (sort === 'recently_visited') {
    return copy.filter((hit) => Boolean(hit.idea.lastAccessedAt));
  }
  if (sort === 'dormant_gems') {
    return copy.filter((hit) => isDormant(hit.idea, now));
  }
  return copy;
}

function visitedMs(idea: Idea): number {
  if (!idea.lastAccessedAt) return 0;
  const t = Date.parse(idea.lastAccessedAt);
  return Number.isFinite(t) ? t : 0;
}

function isDormant(idea: Idea, now: number): boolean {
  const created = Date.parse(idea.createdAt);
  if (!Number.isFinite(created) || now - created < DORMANT_MIN_AGE_MS) return false;
  const last = idea.lastAccessedAt ? Date.parse(idea.lastAccessedAt) : NaN;
  if (!Number.isFinite(last)) return true;
  return now - last >= DORMANT_AFTER_MS;
}

function dormantRank(idea: Idea): number {
  const last = visitedMs(idea);
  if (last === 0) {
    const created = Date.parse(idea.createdAt);
    return Number.isFinite(created) ? created : 0;
  }
  return last;
}

