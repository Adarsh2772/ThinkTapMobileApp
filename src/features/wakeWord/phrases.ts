import type { SpeechLocaleCode } from '@/src/features/languageTranscript/locales';

/** Shared “start recording” phrases across Indian languages (wake + resume). */
const INDIAN_START_PHRASES = [
  // Marathi
  'रेकॉर्डिंग सुरू करा',
  'रेकॉर्डिंग सुरु करा',
  'रेकॉर्डिंग चालू करा',
  'सुरू करा',
  'हे थिंक टॅप',
  'थिंक टॅप',
  // Hindi
  'रिकॉर्डिंग शुरू करो',
  'रिकॉर्डिंग शुरू करें',
  'रिकॉर्डिंग शुरू कर',
  'शुरू करो',
  'शुरू करें',
  // Tamil
  'ரெக்கார்டிங் தொடங்கு',
  'பதிவு தொடங்கு',
  'பதிவு செய்',
  'தொடங்கு',
  // Telugu
  'రికార్డింగ్ ప్రారంభించు',
  'రికార్డింగ్ మొదలు పెట్టు',
  'ప్రారంభించు',
  'మొదలు పెట్టు',
  // Bengali
  'রেকর্ডিং শুরু করুন',
  'রেকর্ডিং শুরু করো',
  'শুরু করুন',
  'শুরু করো',
  // Gujarati
  'રેકોર્ડિંગ શરૂ કરો',
  'રેકોર્ડિંગ શરુ કરો',
  'શરૂ કરો',
  // Kannada
  'ರೆಕಾರ್ಡಿಂಗ್ ಪ್ರಾರಂಭಿಸಿ',
  'ರೆಕಾರ್ಡಿಂಗ್ ಶುರು ಮಾಡಿ',
  'ಪ್ರಾರಂಭಿಸಿ',
  'ಶುರು ಮಾಡಿ',
  // Malayalam
  'റെക്കോർഡിംഗ് ആരംഭിക്കുക',
  'റെക്കോർഡിംഗ് തുടങ്ങുക',
  'ആരംഭിക്കുക',
  'തുടങ്ങുക',
  // Punjabi (Gurmukhi)
  'ਰਿਕਾਰਡਿੰਗ ਸ਼ੁਰੂ ਕਰੋ',
  'ਰਿਕਾਰਡਿੰਗ ਸ਼ੁਰੂ ਕਰੋ',
  'ਸ਼ੁਰੂ ਕਰੋ',
  // Odia
  'ରେକର୍ଡିଂ ଆରମ୍ଭ କରନ୍ତୁ',
  'ରେକର୍ଡିଂ ଶୁରୁ କର',
  'ଆରମ୍ଭ କର',
  // Assamese
  'ৰেকৰ্ডিং আৰম্ভ কৰক',
  'ৰেকৰ্ডিং আৰম্ভ কৰা',
  'আৰম্ভ কৰক',
  // Urdu
  'ریکارڈنگ شروع کریں',
  'ریکارڈنگ شروع کرو',
  'شروع کریں',
  'شروع کرو',
];

/** Romanized fallbacks when the OS recognizer is on English/Hindi. */
const ROMANIZED_START_PHRASES = [
  'recording suru kara',
  'rekording suru kara',
  'record suru kara',
  'suru kara',
  'rekording chalu kara',
  'record chalu kara',
  'recording shuru karo',
  'rekording shuru karo',
  'shuru karo',
  'recording thodangu',
  'recording prarambhinchu',
  'recording shuru korun',
];

/** Canonical + phonetic variants for "Hey Think Tap". */
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
  'start recoding',
  'tap start recording',
  'tap start record',
  'hey think tap start',
  'hey think tap start recording',
  'hey think start recording',
  ...INDIAN_START_PHRASES,
  ...ROMANIZED_START_PHRASES,
];

const PAUSE_COMMANDS = ['pause recording', 'pause the recording', 'pause record'];
const PAUSE_WORDS = ['pause', 'please pause', 'hold', 'hold on'];

const RESUME_COMMANDS = [
  'resume recording',
  'continue recording',
  'start recording',
  'start record',
  ...INDIAN_START_PHRASES,
  ...ROMANIZED_START_PHRASES,
];
const RESUME_WORDS = ['resume', 'continue', 'start', 'go on', 'carry on'];

const INDIAN_STOP_PHRASES = [
  'रिकॉर्डिंग बंद करा',
  'रिकॉर्डिंग बंद करो',
  'ரெக்கார்டிங் நிறுத்து',
  'பதிவு நிறுத்து',
  'రికార్డింగ్ ఆపు',
  'రికార్డింగ్ ఆపండి',
  'রেকর্ডিং বন্ধ করুন',
  'রেকর্ডিং বন্ধ করো',
  'રેકોર્ડિંગ બંધ કરો',
  'ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ',
  'റെക്കോർഡിംഗ് നിർത്തുക',
  'ਰਿਕਾਰਡਿੰਗ ਬੰਦ ਕਰੋ',
  'ରେକର୍ଡିଂ ବନ୍ଦ କର',
  'ৰেকৰ্ডিং বন্ধ কৰক',
  'ریکارڈنگ بند کریں',
  'ریکارڈنگ بند کرو',
  'rekording band kara',
  'recording band kara',
  'record band kara',
];

const STOP_COMMANDS = [
  'stop recording',
  'stop record',
  'stop the recording',
  'hey think tap stop',
  'think tap stop',
  'end recording',
  'finish recording',
  ...INDIAN_STOP_PHRASES,
];

const STOP_WORDS = [
  'stop',
  'please stop',
  'that is all',
  "that's all",
  'im done',
  "i'm done",
  'i am done',
  // Marathi / Hindi (Devanagari)
  'थांब',
  'थांबा',
  'थांबवा',
  'बंद',
  'बंद करा',
  'बंद कर',
  'रोका',
  'रुको',
  'बस',
  'thamba',
  'thambaa',
  'band kara',
  'bas',
  // Tamil
  'நிறுத்து',
  'நிறுத்துங்கள்',
  'நிறுத்த',
  // Telugu
  'ఆపు',
  'ఆపండి',
  'ఆగు',
  // Bengali
  'বন্ধ কর',
  'বন্ধ করুন',
  'থামো',
  'থামুন',
  // Kannada
  'ನಿಲ್ಲಿಸಿ',
  'ನಿಲ್ಲು',
  // Malayalam
  'നിർത്തുക',
  'നിർത്തൂ',
  // Gujarati
  'બંધ કરો',
  'રોકો',
  // Punjabi
  'ਬੰਦ ਕਰੋ',
  'ਰੋਕੋ',
  // Odia
  'ବନ୍ଦ କର',
  'ରୋକ',
  // Assamese
  'বন্ধ কৰক',
  'থামক',
  // Urdu
  'بند کرو',
  'روکو',
  'رکو',
];

/** Scripts kept when normalizing STT text for phrase matching. */
const PHRASE_CHAR_PATTERN =
  /[^\w\u0600-\u06FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\s']/gi;

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(PHRASE_CHAR_PATTERN, ' ')
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

const MARATHI_WAKE_MARKERS = [
  'रेकॉर्डिंग सुरू करा',
  'रेकॉर्डिंग सुरु करा',
  'रेकॉर्डिंग चालू करा',
  'सुरू करा',
  'हे थिंक टॅप',
  'थिंक टॅप',
  'recording suru kara',
  'rekording suru kara',
  'record suru kara',
  'suru kara',
  'rekording chalu kara',
  'record chalu kara',
];

const HINDI_WAKE_MARKERS = [
  'रिकॉर्डिंग शुरू करो',
  'रिकॉर्डिंग शुरू करें',
  'रिकॉर्डिंग शुरू कर',
  'शुरू करो',
  'शुरू करें',
  'recording shuru karo',
  'rekording shuru karo',
  'shuru karo',
];

/** Guess which speech pack to use from the wake phrase the user just spoke. */
export function inferSpeechLocaleFromWakeText(
  text: string,
): SpeechLocaleCode | 'en-US' | null {
  const raw = text.trim();
  const normalized = normalizeSpeech(text);
  if (!raw && !normalized) return null;

  if (/[\u0C00-\u0C7F]/.test(raw)) return 'te-IN';
  if (/[\u0B80-\u0BFF]/.test(raw)) return 'ta-IN';
  if (/[\u0C80-\u0CFF]/.test(raw)) return 'kn-IN';
  if (/[\u0D00-\u0D7F]/.test(raw)) return 'ml-IN';
  if (/[\u0A80-\u0AFF]/.test(raw)) return 'gu-IN';
  if (/[\u0A00-\u0A7F]/.test(raw)) return 'pa-IN';
  if (/[\u0B00-\u0B7F]/.test(raw)) return 'or-IN';
  if (/[\u0980-\u09FF]/.test(raw)) return 'bn-IN';
  if (/[\u0600-\u06FF]/.test(raw)) return 'ur-IN';

  for (const phrase of MARATHI_WAKE_MARKERS) {
    if (raw.includes(phrase) || normalized.includes(normalizeSpeech(phrase))) return 'mr-IN';
  }
  for (const phrase of HINDI_WAKE_MARKERS) {
    if (raw.includes(phrase) || normalized.includes(normalizeSpeech(phrase))) return 'hi-IN';
  }

  if (/[\u0900-\u097F]/.test(raw)) return 'hi-IN';

  if (
    normalized.includes('start recording') ||
    normalized.includes('think tap') ||
    normalized.includes('thinktap')
  ) {
    return 'en-IN';
  }

  return null;
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

/** All voice-command bias strings — every supported language, not tied to Settings. */
export function allVoiceCommandContextualStrings(): string[] {
  return [
    'Hey Think Tap',
    'Think Tap',
    'ThinkTap',
    'start recording',
    'stop recording',
    'pause recording',
    'resume recording',
    ...WAKE_PHRASES,
    ...STOP_COMMANDS,
    ...STOP_WORDS,
    ...PAUSE_COMMANDS,
    ...PAUSE_WORDS,
    ...RESUME_COMMANDS,
    ...RESUME_WORDS,
  ];
}

/** @deprecated Use allVoiceCommandContextualStrings — locale setting is not required. */
export function wakeContextualStrings(_speechLocale?: string): string[] {
  return allVoiceCommandContextualStrings();
}

/** Exported for tests and native parity checks. */
export const voicePhraseCatalog = {
  indianStart: INDIAN_START_PHRASES,
  indianStop: INDIAN_STOP_PHRASES,
  wake: WAKE_PHRASES,
} as const;
