import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';
import type { Idea } from '@/src/types';
import { formatDuration, relativeDate } from '@/src/utils/format';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Movies: 'film-outline',
  Business: 'restaurant-outline',
  Design: 'bulb-outline',
  Music: 'musical-notes-outline',
  Songs: 'musical-note-outline',
  Books: 'book-outline',
  Scripts: 'document-text-outline',
};

type Props = {
  idea: Idea;
  variant?: 'compact' | 'archive';
  onPress: () => void;
};

export function IdeaCard({ idea, variant = 'compact', onPress }: Props) {
  const icon = CATEGORY_ICONS[idea.category] ?? 'bulb-outline';

  if (variant === 'archive') {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.archiveCard, pressed && styles.pressed]}>
        <View style={styles.archiveHeader}>
          <View style={styles.categoryPillDark}>
            <Text style={styles.categoryPillDarkText}>{idea.category.toUpperCase()}</Text>
          </View>
          <Text style={styles.dateText}>{relativeDate(idea.createdAt)}</Text>
        </View>
        <Text style={styles.archiveTitle}>{idea.title}</Text>
        <Text style={styles.snippet} numberOfLines={2}>
          {idea.summary}
        </Text>
        <View style={styles.archiveFooter}>
          <View style={styles.metaRow}>
            <Ionicons name="mic-outline" size={16} color={colors.onSurfaceVariant} />
            <Text style={styles.metaText}>{formatDuration(idea.durationSec)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="flash-outline" size={16} color={colors.onSurfaceVariant} />
            <Text style={styles.metaText}>AI Transcribed</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.compactCard, pressed && styles.pressed]}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {idea.title}
        </Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{idea.category}</Text>
          </View>
          <Text style={styles.metaText}>• {relativeDate(idea.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.metaText}>{formatDuration(idea.durationSec)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  compactCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.stackMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.stackMd,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTitle: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.bodyMd.fontSize,
    color: colors.primary,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chip: {
    backgroundColor: colors.secondaryFixed,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  chipText: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSecondaryFixedVariant,
  },
  metaText: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
  },
  archiveCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.card,
    padding: spacing.stackMd,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  archiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.stackSm,
  },
  categoryPillDark: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  categoryPillDarkText: {
    color: colors.onPrimary,
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  dateText: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
  },
  archiveTitle: {
    fontFamily: fonts.headline,
    fontSize: typography.titleMd.fontSize,
    color: colors.onBackground,
    marginBottom: 8,
  },
  snippet: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.stackMd,
  },
  archiveFooter: {
    flexDirection: 'row',
    gap: spacing.stackMd,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: spacing.stackSm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
