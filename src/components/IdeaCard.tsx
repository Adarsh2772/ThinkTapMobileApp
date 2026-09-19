import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
import type { QueueStatus } from '@/src/services/transcriptionQueue';
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
  /**
   * The idea's real status in the transcription retry queue, when known.
   * Passed down from the list screen, which reads the whole queue once per
   * poll rather than every card reading it separately. Undefined just means
   * "not queued" - either it never needed to be, or it hasn't been checked
   * yet on this render.
   */
  queueState?: QueueStatus;
};

/**
 * Is this thought still waiting for its Thought text?
 *
 * WHY: a take is saved the instant you stop, then the audio is sent for
 * transcription. During that gap the transcript is empty, and the card was
 * showing "Recording is not clear. Please record properly." - which reads as a
 * failure for a recording that is perfectly fine and still processing.
 *
 * The pipeline bumps updatedAt when it finishes, so an unchanged updatedAt
 * means it has not run yet.
 */
function isAwaitingThought(idea: Idea): boolean {
  if ((idea.transcript ?? '').trim()) return false;
  const created = new Date(idea.createdAt).getTime();
  const updated = new Date(idea.updatedAt ?? idea.createdAt).getTime();
  return updated <= created + 500;
}

/**
 * What to show as this thought's category label and color key.
 *
 * WHY this exists: idea.category is set to emptySpeechEnrichment()'s
 * hardcoded placeholder ("Business") the instant a take is saved, before
 * the AI categorization step that would actually determine it has even
 * run - it resolves at the exact same moment as the Thought text, in the
 * same updateIdea() call. Showing that placeholder as if it were the real
 * answer meant a thought about anything else briefly, sometimes not so
 * briefly on a slow connection, showed a wrong category. This mirrors the
 * ideas.tsx tab-list screen's own categoryStateFor exactly, so a card and
 * the tab it lives under never disagree about what state a thought is in.
 *
 * A thought whose retries are genuinely exhausted (queueState 'failed')
 * is neither pending (nothing more will happen on its own) nor the
 * placeholder category (that was never real) - it gets its own honest
 * "Uncategorized" label instead of either claiming a wrong category or
 * showing Loading forever for something that has already, permanently,
 * finished trying.
 */
function categoryLabelFor(idea: Idea, queueState?: QueueStatus): string {
  if (!isAwaitingThought(idea)) return idea.category;
  if (queueState?.state === 'failed') return 'Uncategorized';
  return 'Loading';
}

/**
 * What to show while a thought is awaiting its transcript.
 *
 * WHY this needs to be more than one message: "Preparing your Thought…"
 * with a spinner used to show for every awaiting idea, whether the app was
 * genuinely mid-attempt or had been offline for ten minutes with nothing
 * happening between 15-second retry ticks - both looked identical, like
 * active work was continuously underway. queueState tells the two apart:
 * 'waiting' means nothing is happening right now because there is no
 * connection, so it gets an honest, non-spinning message instead of one
 * that implies the app is busy. 'retrying' and no queue entry at all (still
 * on the very first attempt) are genuine in-flight work, so those keep the
 * spinner.
 */
function ThoughtStatus({ queueState }: { queueState?: QueueStatus }) {
  if (queueState?.state === 'waiting') {
    return (
      <View style={styles.pendingRow}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.onSurfaceVariant} />
        <Text style={styles.pendingText}>Waiting for a connection…</Text>
      </View>
    );
  }
  return (
    <View style={styles.pendingRow}>
      <ActivityIndicator size="small" color={colors.secondary} />
      <Text style={styles.pendingText}>Preparing your Thought…</Text>
    </View>
  );
}

export function IdeaCard({ idea, variant = 'compact', onPress, onDelete, queueState }: Props) {
  const categoryLabel = categoryLabelFor(idea, queueState);
  const isPendingCategory = categoryLabel === 'Loading';
  const icon = CATEGORY_ICONS[categoryLabel] ?? 'bulb-outline';
  const tint = categoryColor(categoryLabel);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (variant === 'archive') {
    return (
      <View style={styles.archiveCard}>
        <View style={styles.archiveHeader}>
          <View style={[styles.categoryPill, { backgroundColor: tint.bg }]}>
            {isPendingCategory ? (
              <ActivityIndicator size="small" color={colors.onPrimary} style={styles.pillSpinner} />
            ) : null}
            <Text style={styles.categoryPillText}>{categoryLabel.toUpperCase()}</Text>
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
          {isAwaitingThought(idea) ? (
            <ThoughtStatus queueState={queueState} />
          ) : (
            <Text style={styles.archiveTitle} numberOfLines={2}>
              {idea.transcript?.trim() ||
                'No Thought for this recording — play the Human Signal above.'}
            </Text>
          )}
          <View style={styles.archiveFooter}>
            <View style={styles.metaRow}>
              <Ionicons name="mic-outline" size={16} color={colors.secondary} />
              <Text style={styles.metaText}>{formatDuration(idea.durationSec)}</Text>
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
        {isAwaitingThought(idea) ? (
          <ThoughtStatus queueState={queueState} />
        ) : (
          <Text style={styles.compactTitle} numberOfLines={1}>
            {idea.transcript?.trim() || 'No Thought yet'}
          </Text>
        )}
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: tint.soft }]}>
            <Text style={[styles.chipText, { color: tint.bg }]}>{categoryLabel}</Text>
          </View>
          <Text style={styles.metaText}>• {relativeDate(idea.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.metaText}>{formatDuration(idea.durationSec)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingText: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  pillSpinner: { marginRight: -2 },
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
