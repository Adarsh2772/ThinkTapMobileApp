import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ellipsize } from '@/src/features/search/searchThoughts';
import { exportThoughtsPdf } from '@/src/services/exportThoughtsPdf';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';
import type { Idea } from '@/src/types';
import { relativeDate } from '@/src/utils/format';

type Props = {
  idea: Idea;
  onPress: () => void;
};

function Field({ label, value, maxChars }: { label: string; value: string; maxChars: number }) {
  const text = value.trim();
  if (!text) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldBody}>{ellipsize(text, maxChars)}</Text>
    </View>
  );
}

export function ThoughtSearchCard({ idea, onPress }: Props) {
  const source = idea.analysis?.sourceOfInspiration ?? '';
  const insight = idea.analysis?.thought?.trim() ?? '';
  const thought = idea.transcript?.trim() ?? '';
  const [exporting, setExporting] = useState(false);

  /**
   * WHY a per-card export exists alongside the bulk "Download PDF report"
   * button above the results list: that button exports every matching
   * result as one combined PDF - correct when someone genuinely wants the
   * whole filtered set, wrong when they searched something broad ("heart")
   * and only actually want the one specific thought they were looking for.
   * This reuses the same export util with a single-item array rather than
   * duplicating any PDF-generation logic.
   */
  const onExportOne = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportThoughtsPdf([idea], thought.slice(0, 40) || 'thought');
    } catch (e) {
      Alert.alert(
        'Could not export',
        e instanceof Error ? e.message : 'Something went wrong creating the PDF.',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.topRow}>
        <Text style={styles.date}>{relativeDate(idea.createdAt)}</Text>
        {/**
         * WHY this doesn't also trigger onPress: a nested Pressable is its
         * own independent touch target in React Native - tapping it does
         * not bubble up to the outer card's onPress the way a DOM click
         * would, so no stopPropagation/event-guard is needed here.
         */}
        <Pressable
          onPress={() => void onExportOne()}
          disabled={exporting}
          hitSlop={8}
          style={styles.downloadBtn}
          accessibilityLabel="Download this thought as a PDF"
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : (
            <Ionicons name="download-outline" size={18} color={colors.secondary} />
          )}
        </Pressable>
      </View>
      <Field label="Thought" value={thought} maxChars={160} />
      <Field label="Source" value={source} maxChars={90} />
      <Field label="AI Core Insight" value={insight} maxChars={90} />
      {!thought ? (
        <Text style={styles.missing}>No Thought on this recording yet.</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  downloadBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondarySoft,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.stackMd,
    gap: 12,
  },
  date: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
  },
  field: { gap: 4 },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.secondary,
  },
  fieldBody: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    color: colors.onSurface,
  },
  missing: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
});
