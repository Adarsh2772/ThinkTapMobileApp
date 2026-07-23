export type AppLanguageCode =
  | 'en'
  | 'hi'
  | 'mr'
  | 'fr'
  | 'es'
  | 'de'
  | 'pt'
  | 'ar'
  | 'zh'
  | 'ja';

export type AppLanguage = {
  code: AppLanguageCode;
  /** BCP-47 / Whisper language code */
  whisperCode: string;
  name: string;
  nativeName: string;
  flag: string;
};

export const APP_LANGUAGES: AppLanguage[] = [
  { code: 'en', whisperCode: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'hi', whisperCode: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'mr', whisperCode: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'fr', whisperCode: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'es', whisperCode: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'de', whisperCode: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', whisperCode: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ar', whisperCode: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'zh', whisperCode: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', whisperCode: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
];

export const DEFAULT_LANGUAGE: AppLanguageCode = 'en';

export function getLanguage(code: string | null | undefined): AppLanguage {
  return APP_LANGUAGES.find((l) => l.code === code) ?? APP_LANGUAGES[0];
}
