import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ellipsize } from '@/src/features/search/searchThoughts';
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Text style={styles.date}>{relativeDate(idea.createdAt)}</Text>
      <Field label="Thought" value={thought} maxChars={160} />
      <Field label="Source" value={source} maxChars={90} />
      <Field label="AI Core Insight" value={insight} maxChars={90} />
      {!thought ? (
        <Text style={styles.missing}>No raw transcript on this thought yet.</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
