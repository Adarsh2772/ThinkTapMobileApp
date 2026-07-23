import type { AppLanguageCode } from '@/src/i18n/languages';

type Dict = {
  settings: string;
  profile: string;
  appLanguage: string;
  appLanguageHint: string;
  transcriptionLanguage: string;
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
};

const en: Dict = {
  settings: 'Settings',
  profile: 'Profile',
  appLanguage: 'App Language',
  appLanguageHint: 'UI and voice transcription use this language',
  transcriptionLanguage: 'Transcription language',
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
  aiTranscribeHint: 'AI will transcribe and categorize instantly',
  myArchive: 'My Archive',
  thoughtsCaptured: 'thoughts captured',
  languageSaved: 'Language updated. New recordings will be transcribed in this language.',
};

const hi: Dict = {
  ...en,
  settings: 'सेटिंग्स',
  profile: 'प्रोफ़ाइल',
  appLanguage: 'ऐप भाषा',
  appLanguageHint: 'इंटरफ़ेस और वॉइस ट्रांसक्रिप्शन इसी भाषा में होंगे',
  transcriptionLanguage: 'ट्रांसक्रिप्शन भाषा',
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
  aiTranscribeHint: 'AI तुरंत ट्रांसक्राइब और कैटेगरी करेगा',
  myArchive: 'मेरा आर्काइव',
  thoughtsCaptured: 'विचार सहेजे गए',
  languageSaved: 'भाषा अपडेट हुई। नई रिकॉर्डिंग इसी भाषा में ट्रांसक्राइब होंगी।',
};

const mr: Dict = {
  ...en,
  settings: 'सेटिंग्ज',
  profile: 'प्रोफाइल',
  appLanguage: 'अ‍ॅप भाषा',
  appLanguageHint: 'इंटरफेस आणि व्हॉइस ट्रान्सक्रिप्शन या भाषेत होतील',
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
  myArchive: 'माझे आर्काइव्ह',
  thoughtsCaptured: 'विचार जतन',
  languageSaved: 'भाषा अपडेट झाली. नवीन रेकॉर्डिंग या भाषेत ट्रान्सक्राइब होतील.',
};

const fr: Dict = {
  ...en,
  settings: 'Paramètres',
  profile: 'Profil',
  appLanguage: "Langue de l'application",
  appLanguageHint: "L'interface et la transcription utilisent cette langue",
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
  aiTranscribeHint: "L'IA transcrit et classe instantanément",
  myArchive: 'Mon archive',
  thoughtsCaptured: 'pensées capturées',
  languageSaved: 'Langue mise à jour. Les nouveaux enregistrements seront transcrits dans cette langue.',
};

const es: Dict = {
  ...en,
  settings: 'Ajustes',
  profile: 'Perfil',
  appLanguage: 'Idioma de la app',
  appLanguageHint: 'La interfaz y la transcripción usan este idioma',
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
  myArchive: 'Mi archivo',
  thoughtsCaptured: 'ideas capturadas',
  languageSaved: 'Idioma actualizado. Las nuevas grabaciones se transcribirán en este idioma.',
};

const de: Dict = {
  ...en,
  settings: 'Einstellungen',
  profile: 'Profil',
  appLanguage: 'App-Sprache',
  appLanguageHint: 'Oberfläche und Transkription nutzen diese Sprache',
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
  myArchive: 'Mein Archiv',
  thoughtsCaptured: 'Gedanken erfasst',
  languageSaved: 'Sprache aktualisiert. Neue Aufnahmen werden in dieser Sprache transkribiert.',
};

const pt: Dict = {
  ...en,
  settings: 'Definições',
  profile: 'Perfil',
  appLanguage: 'Idioma da app',
  appLanguageHint: 'A interface e a transcrição usam este idioma',
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
  myArchive: 'O meu arquivo',
  thoughtsCaptured: 'ideias capturadas',
  languageSaved: 'Idioma atualizado. Novas gravações serão transcritas neste idioma.',
};

const ar: Dict = {
  ...en,
  settings: 'الإعدادات',
  profile: 'الملف الشخصي',
  appLanguage: 'لغة التطبيق',
  appLanguageHint: 'الواجهة والنسخ النصي يستخدمان هذه اللغة',
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
  myArchive: 'أرشيفي',
  thoughtsCaptured: 'أفكار محفوظة',
  languageSaved: 'تم تحديث اللغة. سيتم نسخ التسجيلات الجديدة بهذه اللغة.',
};

const zh: Dict = {
  ...en,
  settings: '设置',
  profile: '个人资料',
  appLanguage: '应用语言',
  appLanguageHint: '界面与语音转写将使用此语言',
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
  myArchive: '我的归档',
  thoughtsCaptured: '条灵感已保存',
  languageSaved: '语言已更新。新录音将按此语言转写。',
};

const ja: Dict = {
  ...en,
  settings: '設定',
  profile: 'プロフィール',
  appLanguage: 'アプリの言語',
  appLanguageHint: 'UIと音声文字起こしにこの言語を使います',
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
  myArchive: 'マイアーカイブ',
  thoughtsCaptured: '件のメモ',
  languageSaved: '言語を更新しました。新しい録音はこの言語で文字起こしされます。',
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
