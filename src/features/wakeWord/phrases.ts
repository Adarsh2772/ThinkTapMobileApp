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

/**
 * Commands come in two strengths, because the recognizer reports a partial
 * hypothesis for every word you speak while dictating.
 *
 * COMMANDS are unambiguous enough to honour anywhere in a sentence. WORDS are
 * everyday speech ("stop", "hold", "बस") and only count when they are the whole
 * utterance — otherwise "we should stop doing that" ends the take mid-idea.
 */
const PAUSE_COMMANDS = ['pause recording', 'pause the recording', 'pause record'];
const PAUSE_WORDS = ['pause', 'please pause', 'hold', 'hold on'];

const RESUME_COMMANDS = [
  'resume recording',
  'continue recording',
  'start recording',
  'start record',
];
const RESUME_WORDS = ['resume', 'continue', 'start', 'go on', 'carry on'];

/** Ends an active recording (English + Indian languages). */
const STOP_COMMANDS = [
  'stop recording',
  'stop record',
  'stop the recording',
  'hey think tap stop',
  'think tap stop',
  'end recording',
  'finish recording',
  'रिकॉर्डिंग बंद करा',
  'रिकॉर्डिंग बंद करो',
];
const STOP_WORDS = [
  'stop',
  'please stop',
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

function matchesCommand(text: string, commands: string[], words: string[]): boolean {
  const normalized = normalizeSpeech(text);
  if (!normalized) return false;
  if (commands.some((phrase) => normalized.includes(phrase))) return true;
  return words.some((phrase) => normalized === phrase);
}

export function matchesStopPhrase(text: string): boolean {
  return matchesCommand(text, STOP_COMMANDS, STOP_WORDS);
}

export function matchesPausePhrase(text: string): boolean {
  return matchesCommand(text, PAUSE_COMMANDS, PAUSE_WORDS);
}

export function matchesResumePhrase(text: string): boolean {
  return matchesCommand(text, RESUME_COMMANDS, RESUME_WORDS);
}

export function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}
