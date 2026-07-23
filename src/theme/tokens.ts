export const colors = {
  background: '#f9f9ff',
  surface: '#f9f9ff',
  surfaceContainer: '#e7eefe',
  surfaceContainerLow: '#f0f3ff',
  surfaceContainerHigh: '#e2e8f8',
  surfaceContainerLowest: '#ffffff',
  surfaceVariant: '#dce2f3',
  primary: '#111111',
  onPrimary: '#ffffff',
  secondary: '#4b41e1',
  secondaryFixed: '#e2dfff',
  onSecondaryFixedVariant: '#3323cc',
  onSurface: '#151c27',
  onSurfaceVariant: '#444748',
  onBackground: '#151c27',
  outline: '#747878',
  outlineVariant: '#c4c7c7',
  border: '#EAEAEA',
  textSecondary: '#6B7280',
  success: '#22C55E',
  error: '#ba1a1a',
  chipInactive: '#F3F4F6',
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
  card: 16,
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
