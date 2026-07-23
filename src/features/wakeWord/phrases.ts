/** Canonical + phonetic variants for "Hey Think Tap" (like OneTap wake phrases). */
const WAKE_PHRASES = [
  'hey think tap',
  'hey thinktap',
  'hey think app',
  'hey thinktab',
  'a think tap',
  'hey thin tap',
  'hey thing tap',
  'think tap',
  'thinktap',
  'start recording',
  'start record',
  'hey think tap start',
];

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesWakePhrase(text: string): boolean {
  const normalized = normalizeSpeech(text);
  if (!normalized) return false;
  return WAKE_PHRASES.some(
    (phrase) => normalized === phrase || normalized.includes(phrase),
  );
}
