export const colors = {
  /** Soft blue canvas — clear on phone screens */
  background: '#F0F5FF',
  surface: '#F7F9FF',
  surfaceContainer: '#E0E9FF',
  surfaceContainerLow: '#EAF0FF',
  surfaceContainerHigh: '#D4E0FF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceVariant: '#D8E3F8',

  /** Deep navy for readable body text */
  primary: '#0F1C3F',
  onPrimary: '#FFFFFF',

  /** Clear blue accent — primary actions & nav */
  secondary: '#2563EB',
  secondaryFixed: '#DBEAFE',
  onSecondaryFixedVariant: '#1D4ED8',
  secondarySoft: '#EFF6FF',

  /** Recording / energy — slightly warmer blue-red for stop states */
  accent: '#EF4444',
  accentSoft: '#FEE2E2',
  accentDeep: '#DC2626',

  onSurface: '#152238',
  onSurfaceVariant: '#4B5B76',
  onBackground: '#0F1C3F',
  outline: '#64748B',
  outlineVariant: '#C7D2E5',
  border: '#D6E0F0',
  textSecondary: '#5B6B86',

  success: '#16A34A',
  successSoft: '#DCFCE7',
  error: '#DC2626',
  errorSoft: '#FEE2E2',
  warning: '#D97706',
  warningSoft: '#FEF3C7',

  chipInactive: '#E8EEF9',
  tabBar: 'rgba(255,255,255,0.96)',
  drawerBg: '#0F1C3F',
  drawerText: '#EEF3FF',
  drawerMuted: '#93A4C3',
  drawerActive: '#3B82F6',
  drawerActiveBg: 'rgba(59,130,246,0.2)',
  overlay: 'rgba(15,28,63,0.5)',
  shadow: '#0F1C3F',
} as const;

export const spacing = {
  containerMargin: 20,
  gutter: 16,
  stackSm: 8,
  stackMd: 16,
  stackLg: 32,
  sectionGap: 48,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  card: 18,
  full: 9999,
} as const;

export const fonts = {
  headline: 'HankenGrotesk_600SemiBold',
  headlineBold: 'HankenGrotesk_700Bold',
  headlineExtra: 'HankenGrotesk_800ExtraBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  label: 'Inter_500Medium',
} as const;

export const typography = {
  headlineLgMobile: { fontSize: 28, lineHeight: 34 },
  titleMd: { fontSize: 20, lineHeight: 28 },
  bodyMd: { fontSize: 16, lineHeight: 24 },
  bodyLg: { fontSize: 18, lineHeight: 28 },
  labelMd: { fontSize: 14, lineHeight: 20 },
  labelSm: { fontSize: 12, lineHeight: 16 },
} as const;

export const CATEGORIES = [
  'All',
  'Movies',
  'Songs',
  'Books',
  'Business',
  'Scripts',
  'Design',
  'Music',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Soft tint + ink per category — blue-led family for clearer contrast */
export const CATEGORY_COLORS: Record<string, { bg: string; fg: string; soft: string }> = {
  All: { bg: '#2563EB', fg: '#FFFFFF', soft: '#DBEAFE' },
  Movies: { bg: '#3B82F6', fg: '#FFFFFF', soft: '#DBEAFE' },
  Songs: { bg: '#6366F1', fg: '#FFFFFF', soft: '#E0E7FF' },
  Books: { bg: '#0EA5E9', fg: '#FFFFFF', soft: '#E0F2FE' },
  Business: { bg: '#1D4ED8', fg: '#FFFFFF', soft: '#DBEAFE' },
  Scripts: { bg: '#4F46E5', fg: '#FFFFFF', soft: '#E0E7FF' },
  Design: { bg: '#0284C7', fg: '#FFFFFF', soft: '#E0F2FE' },
  Music: { bg: '#2563EB', fg: '#FFFFFF', soft: '#DBEAFE' },
};

export function categoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? { bg: colors.secondary, fg: colors.onPrimary, soft: colors.secondaryFixed };
}
