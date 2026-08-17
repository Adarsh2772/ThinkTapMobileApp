/** Canonical + phonetic variants for "Hey Think Tap" (like OneTap wake phrases). */
const WAKE_PHRASES = [
  'hey think tap',
  'hey thinktap',
  'hey think app',
  'hey thinktab',
  'a think tap',
  'hey thin tap',
  'hey thing tap',
  'hi think tap',
  'hey think that',
  'hey think cap',
  'hey think top',
  'think tap',
  'thinktap',
  'think app',
  'start recording',
  'start record',
  'hey think tap start',
];

/** Phrases that should pause an active recording. */
const PAUSE_PHRASES = [
  'pause',
  'pause recording',
  'pause the recording',
  'please pause',
  'hold',
  'hold on',
];

/** Phrases that should resume a paused recording. */
const RESUME_PHRASES = [
  'resume',
  'resume recording',
  'continue',
  'continue recording',
  'start',
  'start recording',
  'start record',
];

/** Phrases that should end an active recording (English + Hindi/Marathi). */
const STOP_PHRASES = [
  'stop',
  'stop recording',
  'stop record',
  'stop the recording',
  'please stop',
  'hey think tap stop',
  'think tap stop',
  'end recording',
  'finish recording',
  'that is all',
  "that's all",
  'im done',
  "i'm done",
  'i am done',
  // Marathi / Hindi
  'थांब',
  'थांबा',
  'थांबवा',
  'बंद',
  'बंद करा',
  'बंद कर',
  'रोका',
  'रुको',
  'बस',
  'होराहा है बंद',
  // Other Indian languages (common “stop” commands)
  'நிறுத்து',
  'বন্ধ কর',
  'থামো',
  'ఆపు',
  'ನಿಲ್ಲಿಸಿ',
  'നിർത്തുക',
  'બંધ કરો',
  'ਬੰਦ ਕਰੋ',
];

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    // Keep Latin + major Indic scripts and digits.
    .replace(
      /[^\w\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\s']/gi,
      ' ',
    )
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

function matchesTrailingCommand(text: string, phrases: string[]): boolean {
  const normalized = normalizeSpeech(text);
  if (!normalized) return false;
  return phrases.some((phrase) => normalized === phrase || normalized.endsWith(` ${phrase}`));
}

export function matchesStopPhrase(text: string): boolean {
  const normalized = normalizeSpeech(text);
  if (!normalized) return false;
  if (matchesTrailingCommand(text, STOP_PHRASES)) return true;
  const embedded = [
    'stop recording',
    'stop record',
    'end recording',
    'finish recording',
    'please stop',
  ];
  return embedded.some((phrase) => normalized.includes(phrase));
}

export function matchesPausePhrase(text: string): boolean {
  return matchesTrailingCommand(text, PAUSE_PHRASES);
}

export function matchesResumePhrase(text: string): boolean {
  return matchesTrailingCommand(text, RESUME_PHRASES);
}

export function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}
