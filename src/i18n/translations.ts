import type { AppLanguageCode } from '@/src/i18n/languages';

type Dict = {
  settings: string;
  profile: string;
  appLanguage: string;
  appLanguageHint: string;
  transcriptionLanguage: string;
  transcriptionLanguageHint: string;
  speechLocaleSaved: string;
  chooseLanguage: string;
  selected: string;
  appVersion: string;
  signOut: string;
  signOutConfirm: string;
  cancel: string;
  comingSoon: string;
  wakeWordBiometrics: string;
  home: string;
  ideas: string;
  search: string;
  readyForIdea: string;
  recentIdeas: string;
  viewAll: string;
  tapToRecord: string;
  recording: string;
  aiTranscribeHint: string;
  myArchive: string;
  thoughtsCaptured: string;
  languageSaved: string;
  subscribe: string;
  basicInfo: string;
  fullName: string;
  email: string;
  contact: string;
  profession: string;
  businessman: string;
  workingProfessional: string;
  language: string;
  professionRequired: string;
  freeTrial: string;
  freeTrialPlan: string;
  freeTrialDesc: string;
  freeTrialFeature1: string;
  freeTrialFeature2: string;
  freeTrialFeature3: string;
  startFreeTrial: string;
  startingTrial: string;
  updateSubscription: string;
  freeTrialStarted: string;
  freeTrialActive: string;
};

const en: Dict = {
  settings: 'Settings',
  profile: 'Profile',
  appLanguage: 'App Language',
  appLanguageHint: 'Controls the app interface only. Pick a transcription language separately for speech-to-text.',
  transcriptionLanguage: 'Transcription language',
  transcriptionLanguageHint:
    'OS speech recognition for Indian languages. Pick the language you will speak. Availability depends on your device.',
  speechLocaleSaved: 'Transcription language updated. Speak in this language when recording.',
  chooseLanguage: 'Choose language',
  selected: 'Selected',
  appVersion: 'App version',
  signOut: 'Sign out',
  signOutConfirm: 'You can sign back in anytime.',
  cancel: 'Cancel',
  comingSoon: 'Coming soon',
  wakeWordBiometrics: 'Wake word · Biometrics',
  home: 'Home',
  ideas: 'Ideas',
  search: 'Search',
  readyForIdea: 'Ready for your next idea?',
  recentIdeas: 'Recent Ideas',
  viewAll: 'View all',
  tapToRecord: 'Tap to Record',
  recording: 'Recording…',
  aiTranscribeHint: 'On-device speech-to-text — set your transcription language in Settings',
  myArchive: 'My Archive',
  thoughtsCaptured: 'thoughts captured',
  languageSaved: 'App language updated. Transcription language was synced when applicable — check Settings → Transcription language.',
  subscribe: 'Subscribe',
  basicInfo: 'Basic info',
  fullName: 'Name',
  email: 'Email',
  contact: 'Contact',
  profession: 'Profession',
  businessman: 'Businessman',
  workingProfessional: 'Working professional',
  language: 'Language',
  professionRequired: 'Please select businessman or working professional',
  freeTrial: 'Free Trial',
  freeTrialPlan: 'Free Trial plan',
  freeTrialDesc: 'Try Think Tap with full capture and archive features — no payment required to start.',
  freeTrialFeature1: 'Unlimited idea captures during trial',
  freeTrialFeature2: 'On-device speech-to-text',
  freeTrialFeature3: 'Personal idea archive',
  startFreeTrial: 'Start Free Trial',
  startingTrial: 'Starting…',
  updateSubscription: 'Update details',
  freeTrialStarted: 'Your Free Trial is active. Enjoy capturing ideas!',
  freeTrialActive: 'Free Trial active',
};

const hi: Dict = {
  ...en,
  settings: 'सेटिंग्स',
  profile: 'प्रोफ़ाइल',
  appLanguage: 'ऐप भाषा',
  appLanguageHint: 'केवल ऐप इंटरफ़ेस की भाषा। ट्रांसक्रिप्शन भाषा अलग से चुनें।',
  transcriptionLanguage: 'ट्रांसक्रिप्शन भाषा',
  transcriptionLanguageHint:
    'भारतीय भाषाओं के लिए डिवाइस स्पीच रिकग्निशन। वही भाषा चुनें जिसमें आप बोलेंगे।',
  speechLocaleSaved: 'ट्रांसक्रिप्शन भाषा अपडेट हुई। रिकॉर्ड करते समय इसी भाषा में बोलें।',
  chooseLanguage: 'भाषा चुनें',
  selected: 'चयनित',
  appVersion: 'ऐप संस्करण',
  signOut: 'साइन आउट',
  signOutConfirm: 'आप कभी भी वापस साइन इन कर सकते हैं।',
  cancel: 'रद्द करें',
  home: 'होम',
  ideas: 'आइडिया',
  search: 'खोज',
  readyForIdea: 'अगले आइडिया के लिए तैयार?',
  recentIdeas: 'हाल के आइडिया',
  viewAll: 'सभी देखें',
  tapToRecord: 'रिकॉर्ड करने के लिए टैप करें',
  recording: 'रिकॉर्डिंग…',
  aiTranscribeHint: 'डिवाइस स्पीच-टू-टेक्स्ट — सेटिंग्स में ट्रांसक्रिप्शन भाषा चुनें',
  myArchive: 'मेरा आर्काइव',
  thoughtsCaptured: 'विचार सहेजे गए',
  languageSaved: 'ऐप भाषा अपडेट हुई। ट्रांसक्रिप्शन भाषा भी सिंक हो सकती है — सेटिंग्स → ट्रांसक्रिप्शन भाषा देखें।',
};

const mr: Dict = {
  ...en,
  settings: 'सेटिंग्ज',
  profile: 'प्रोफाइल',
  appLanguage: 'अ‍ॅप भाषा',
  appLanguageHint: 'फक्त अ‍ॅप इंटरफेसची भाषा. ट्रान्सक्रिप्शन भाषा वेगळी निवडा.',
  transcriptionLanguage: 'ट्रान्सक्रिप्शन भाषा',
  transcriptionLanguageHint:
    'भारतीय भाषांसाठी डिव्हाइस स्पीच रिकग्निशन. ज्या भाषेत बोलाल ती निवडा.',
  speechLocaleSaved: 'ट्रान्सक्रिप्शन भाषा अपडेट झाली. रेकॉर्ड करताना याच भाषेत बोला.',
  chooseLanguage: 'भाषा निवडा',
  selected: 'निवडलेले',
  signOut: 'साइन आउट',
  home: 'होम',
  ideas: 'आयडिया',
  search: 'शोध',
  readyForIdea: 'पुढच्या आयडियासाठी तयार?',
  recentIdeas: 'अलीकडील आयडिया',
  viewAll: 'सर्व पहा',
  tapToRecord: 'रेकॉर्ड करण्यासाठी टॅप करा',
  recording: 'रेकॉर्डिंग…',
  aiTranscribeHint: 'डिव्हाइस स्पीच-टू-टेक्स्ट — सेटिंग्जमध्ये ट्रान्सक्रिप्शन भाषा निवडा',
  myArchive: 'माझे आर्काइव्ह',
  thoughtsCaptured: 'विचार जतन',
  languageSaved: 'अ‍ॅप भाषा अपडेट झाली. ट्रान्सक्रिप्शन भाषाही सिंक होऊ शकते — सेटिंग्ज → ट्रान्सक्रिप्शन भाषा पाहा.',
};

const fr: Dict = {
  ...en,
  settings: 'Paramètres',
  profile: 'Profil',
  appLanguage: "Langue de l'application",
  appLanguageHint: "Contrôle uniquement l'interface. La parole est détectée automatiquement.",
  chooseLanguage: 'Choisir la langue',
  selected: 'Sélectionné',
  signOut: 'Se déconnecter',
  cancel: 'Annuler',
  home: 'Accueil',
  ideas: 'Idées',
  search: 'Recherche',
  readyForIdea: 'Prêt pour votre prochaine idée ?',
  recentIdeas: 'Idées récentes',
  viewAll: 'Tout voir',
  tapToRecord: 'Appuyer pour enregistrer',
  recording: 'Enregistrement…',
  aiTranscribeHint: "L'IA détecte votre langue et transcrit instantanément",
  myArchive: 'Mon archive',
  thoughtsCaptured: 'pensées capturées',
  languageSaved: "Langue de l'app mise à jour. La transcription détecte toujours la langue parlée.",
};

const es: Dict = {
  ...en,
  settings: 'Ajustes',
  profile: 'Perfil',
  appLanguage: 'Idioma de la app',
  appLanguageHint: 'Solo controla la interfaz. El habla se detecta automáticamente.',
  chooseLanguage: 'Elegir idioma',
  selected: 'Seleccionado',
  signOut: 'Cerrar sesión',
  cancel: 'Cancelar',
  home: 'Inicio',
  ideas: 'Ideas',
  search: 'Buscar',
  readyForIdea: '¿Listo para tu próxima idea?',
  recentIdeas: 'Ideas recientes',
  viewAll: 'Ver todo',
  tapToRecord: 'Toca para grabar',
  recording: 'Grabando…',
  aiTranscribeHint: 'La IA detecta tu idioma y transcribe al instante',
  myArchive: 'Mi archivo',
  thoughtsCaptured: 'ideas capturadas',
  languageSaved: 'Idioma de la app actualizado. La transcripción sigue detectando lo que hablas.',
};

const de: Dict = {
  ...en,
  settings: 'Einstellungen',
  profile: 'Profil',
  appLanguage: 'App-Sprache',
  appLanguageHint: 'Steuert nur die Oberfläche. Gesprochene Sprache wird automatisch erkannt.',
  chooseLanguage: 'Sprache wählen',
  selected: 'Ausgewählt',
  signOut: 'Abmelden',
  cancel: 'Abbrechen',
  home: 'Start',
  ideas: 'Ideen',
  search: 'Suche',
  readyForIdea: 'Bereit für deine nächste Idee?',
  recentIdeas: 'Aktuelle Ideen',
  viewAll: 'Alle anzeigen',
  tapToRecord: 'Tippen zum Aufnehmen',
  recording: 'Aufnahme…',
  aiTranscribeHint: 'KI erkennt deine Sprache und transkribiert sofort',
  myArchive: 'Mein Archiv',
  thoughtsCaptured: 'Gedanken erfasst',
  languageSaved: 'App-Sprache aktualisiert. Die Transkription erkennt weiterhin automatisch die gesprochene Sprache.',
};

const pt: Dict = {
  ...en,
  settings: 'Definições',
  profile: 'Perfil',
  appLanguage: 'Idioma da app',
  appLanguageHint: 'Controla apenas a interface. A fala é detetada automaticamente.',
  chooseLanguage: 'Escolher idioma',
  selected: 'Selecionado',
  signOut: 'Terminar sessão',
  cancel: 'Cancelar',
  home: 'Início',
  ideas: 'Ideias',
  search: 'Pesquisar',
  readyForIdea: 'Pronto para a próxima ideia?',
  recentIdeas: 'Ideias recentes',
  viewAll: 'Ver tudo',
  tapToRecord: 'Toque para gravar',
  recording: 'A gravar…',
  aiTranscribeHint: 'A IA deteta o seu idioma e transcreve na hora',
  myArchive: 'O meu arquivo',
  thoughtsCaptured: 'ideias capturadas',
  languageSaved: 'Idioma da app atualizado. A transcrição continua a detetar o que fala.',
};

const ar: Dict = {
  ...en,
  settings: 'الإعدادات',
  profile: 'الملف الشخصي',
  appLanguage: 'لغة التطبيق',
  appLanguageHint: 'يتحكم بواجهة التطبيق فقط. يُكتشف الكلام تلقائياً.',
  chooseLanguage: 'اختر اللغة',
  selected: 'محدد',
  signOut: 'تسجيل الخروج',
  cancel: 'إلغاء',
  home: 'الرئيسية',
  ideas: 'الأفكار',
  search: 'بحث',
  readyForIdea: 'هل أنت مستعد لفكرتك التالية؟',
  recentIdeas: 'أفكار حديثة',
  viewAll: 'عرض الكل',
  tapToRecord: 'انقر للتسجيل',
  recording: 'جاري التسجيل…',
  aiTranscribeHint: 'يكتشف الذكاء الاصطناعي لغتك وينسخها فوراً',
  myArchive: 'أرشيفي',
  thoughtsCaptured: 'أفكار محفوظة',
  languageSaved: 'تم تحديث لغة التطبيق. النسخ النصي ما زال يكتشف اللغة المنطوقة تلقائياً.',
};

const zh: Dict = {
  ...en,
  settings: '设置',
  profile: '个人资料',
  appLanguage: '应用语言',
  appLanguageHint: '仅控制界面语言。语音会自动检测并按所说语言转写。',
  chooseLanguage: '选择语言',
  selected: '已选择',
  signOut: '退出登录',
  cancel: '取消',
  home: '首页',
  ideas: '灵感',
  search: '搜索',
  readyForIdea: '准备好记录下一个灵感了吗？',
  recentIdeas: '最近灵感',
  viewAll: '查看全部',
  tapToRecord: '点击录音',
  recording: '录音中…',
  aiTranscribeHint: 'AI 自动识别语言并即时转写',
  myArchive: '我的归档',
  thoughtsCaptured: '条灵感已保存',
  languageSaved: '应用语言已更新。语音转写仍会自动检测您所说的语言。',
};

const ja: Dict = {
  ...en,
  settings: '設定',
  profile: 'プロフィール',
  appLanguage: 'アプリの言語',
  appLanguageHint: 'アプリの表示言語のみ。音声は自動検出され、話した言語で文字起こしされます。',
  chooseLanguage: '言語を選択',
  selected: '選択中',
  signOut: 'サインアウト',
  cancel: 'キャンセル',
  home: 'ホーム',
  ideas: 'アイデア',
  search: '検索',
  readyForIdea: '次のアイデアの準備はできていますか？',
  recentIdeas: '最近のアイデア',
  viewAll: 'すべて見る',
  tapToRecord: 'タップして録音',
  recording: '録音中…',
  aiTranscribeHint: 'AIが言語を自動検出し、すぐに文字起こしします',
  myArchive: 'マイアーカイブ',
  thoughtsCaptured: '件のメモ',
  languageSaved: 'アプリ言語を更新しました。文字起こしは引き続き話した言語を自動検出します。',
};

const TABLES: Record<AppLanguageCode, Dict> = {
  en,
  hi,
  mr,
  fr,
  es,
  de,
  pt,
  ar,
  zh,
  ja,
};

export function t(code: AppLanguageCode, key: keyof Dict): string {
  return TABLES[code]?.[key] ?? TABLES.en[key];
}

export function isRtl(code: AppLanguageCode): boolean {
  return code === 'ar';
}
