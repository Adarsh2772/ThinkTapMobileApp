import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DeleteThoughtDialog } from '@/src/components/DeleteThoughtDialog';

import {
  categoryColor,
  colors,
  fonts,
  radii,
  spacing,
  typography,
} from '@/src/theme/tokens';
import type { Idea } from '@/src/types';
import { formatDuration, relativeDate } from '@/src/utils/format';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Movies: 'film-outline',
  Business: 'briefcase-outline',
  Design: 'color-palette-outline',
  Music: 'musical-notes-outline',
  Songs: 'musical-note-outline',
  Books: 'book-outline',
  Scripts: 'document-text-outline',
};

type Props = {
  idea: Idea;
  variant?: 'compact' | 'archive';
  onPress: () => void;
  onDelete?: () => void;
};

export function IdeaCard({ idea, variant = 'compact', onPress, onDelete }: Props) {
  const icon = CATEGORY_ICONS[idea.category] ?? 'bulb-outline';
  const tint = categoryColor(idea.category);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (variant === 'archive') {
    return (
      <View style={styles.archiveCard}>
        <View style={styles.archiveHeader}>
          <View style={[styles.categoryPill, { backgroundColor: tint.bg }]}>
            <Text style={styles.categoryPillText}>{idea.category.toUpperCase()}</Text>
          </View>
          <View style={styles.archiveHeaderRight}>
            <Text style={styles.dateText}>{relativeDate(idea.createdAt)}</Text>
            {onDelete ? (
              <Pressable
                onPress={() => setConfirmDelete(true)}
                hitSlop={12}
                style={styles.deleteBtn}
                accessibilityLabel="Delete thought"
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.archiveBody, pressed && styles.pressed]}
        >
          <Text style={styles.archiveTitle}>{idea.title}</Text>
          <Text style={styles.snippet} numberOfLines={2}>
            {idea.analysis?.thought?.trim() || idea.summary}
          </Text>
          <View style={styles.archiveFooter}>
            <View style={styles.metaRow}>
              <Ionicons name="mic-outline" size={16} color={colors.secondary} />
              <Text style={styles.metaText}>{formatDuration(idea.durationSec)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="flash-outline" size={16} color={colors.accent} />
              <Text style={styles.metaText}>AI Transcribed</Text>
            </View>
          </View>
        </Pressable>
        <DeleteThoughtDialog
          visible={confirmDelete}
          title={idea.title}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete?.();
          }}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.compactCard, pressed && styles.pressed]}
    >
      <View style={[styles.iconBox, { backgroundColor: tint.soft }]}>
        <Ionicons name={icon} size={22} color={tint.bg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {idea.title}
        </Text>
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: tint.soft }]}>
            <Text style={[styles.chipText, { color: tint.bg }]}>{idea.category}</Text>
          </View>
          <Text style={styles.metaText}>• {relativeDate(idea.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.metaText}>{formatDuration(idea.durationSec)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.94 },
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  chipText: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
  },
  metaText: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
  },
  archiveCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.stackMd,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  archiveBody: {},
  archiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.stackSm,
    zIndex: 2,
  },
  archiveHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  categoryPillText: {
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.stackSm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
