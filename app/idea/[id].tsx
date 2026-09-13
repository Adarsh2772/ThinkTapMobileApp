import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioPlayer } from '@/src/components/AudioPlayer';
import {
  processTranscriptionQueue,
  queueStatus,
  retryNow,
  type QueueStatus,
} from '@/src/services/transcriptionQueue';
import { DeleteThoughtDialog } from '@/src/components/DeleteThoughtDialog';
import { findLanguageByWhisperCode, resolveSpokenLanguage } from '@/src/i18n/languages';
import { useIdeasStore } from '@/src/store/ideasStore';
import { categoryColor, colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';
import type { TranscriptAnalysis } from '@/src/types';
import { relativeDate } from '@/src/utils/format';

type AnalysisField = {
  key: keyof TranscriptAnalysis;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  soft: string;
};

const ANALYSIS_FIELDS: AnalysisField[] = [
  {
    key: 'expansionPaths',
    label: 'Expansion paths',
    icon: 'git-branch-outline',
    accent: '#4F46E5',
    soft: '#E0E7FF',
  },
  {
    key: 'sourceOfInspiration',
    label: 'Source of inspiration',
    icon: 'sparkles-outline',
    accent: '#0EA5E9',
    soft: '#E0F2FE',
  },
  {
    key: 'thought',
    label: 'Thought',
    icon: 'bulb-outline',
    accent: colors.secondary,
    soft: colors.secondarySoft,
  },
  {
    key: 'potentialValue',
    label: 'Potential value',
    icon: 'diamond-outline',
    accent: '#16A34A',
    soft: colors.successSoft,
  },
  {
    key: 'connectedThoughts',
    label: 'Connected thoughts',
    icon: 'link-outline',
    accent: '#D97706',
    soft: colors.warningSoft,
  },
];

export default function IdeaDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const idea = useIdeasStore((s) => (id ? s.ideas.find((item) => item.id === id) : undefined));
  const updateIdea = useIdeasStore((s) => s.updateIdea);
  const deleteIdea = useIdeasStore((s) => s.deleteIdea);
  const touchIdea = useIdeasStore((s) => s.touchIdea);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, forceTick] = useState(0);
  const knownLanguage = idea ? findLanguageByWhisperCode(idea.language) : undefined;
  const spoken = idea ? resolveSpokenLanguage(idea.language) : null;
  const isLive = idea?.transcriptSource === 'live';
  const isDevice = idea?.transcriptSource === 'device';

  /**
   * WHY a pending state: the thought is saved the moment you press stop so the
   * audio can never be lost, but the transcript arrives a few seconds later
   * once Whisper returns. Previously that gap showed as an empty box, which
   * read as "transcription failed" - the text only seemed to appear when
   * something else caused a re-render.
   */
  const transcriptText = (idea?.transcript ?? '').trim();
  const createdAtMs = idea?.createdAt ? new Date(idea.createdAt).getTime() : 0;
  const updatedAtMs = idea?.updatedAt ? new Date(idea.updatedAt).getTime() : 0;
  const createdMsAgo = createdAtMs ? Date.now() - createdAtMs : Number.MAX_SAFE_INTEGER;

  /**
   * WHY updatedAt is the signal: buildLocalIdea saves the take with
   * updatedAt === createdAt, then the transcription pipeline patches the record
   * and bumps updatedAt. So a later updatedAt means the pipeline has finished -
   * whether it produced text or not.
   *
   * Without that check the spinner spun forever whenever transcription failed
   * (no API key, no network), which looks identical to "still working".
   * The time cap is a backstop in case the app was killed mid-pipeline.
   */
  const pipelineFinished = updatedAtMs > createdAtMs + 500;

  /**
   * WHY a queued state separate from "transcribing": a spinner that silently
   * times out into "no transcript was produced" tells the user nothing and
   * offers no way forward. Knowing the recording is waiting for a connection -
   * and being able to retry - is the difference between a bug and a status.
   */
  const [qStatus, setQStatus] = useState<QueueStatus>({ state: 'none' });
  const [retrying, setRetrying] = useState(false);

  /**
   * WHY the poll: the queue retries on its own every 15 seconds, so the moment
   * a connection returns the transcript arrives without the user doing
   * anything. This just keeps the screen in step with that.
   */
  useEffect(() => {
    if (!idea?.id) return;
    let cancelled = false;

    /**
     * WHY the retry lives here rather than in a shared timer: this screen is
     * where the user waits for the transcript, so it owns the retry while it is
     * visible and stops when it is not. One less global to keep in sync.
     */
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        await processTranscriptionQueue();
        const st = await queueStatus(idea.id);
        if (!cancelled) setQStatus(st);
      } finally {
        busy = false;
      }
    };
    void check();
    // 8s: fast enough to feel automatic, slow enough not to hammer the network.
    const id = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [idea?.id, transcriptText]);

  const onRetry = async () => {
    if (!idea?.id || retrying) return;
    setRetrying(true);
    const result = await retryNow(idea.id);
    setRetrying(false);
    if (!result.ok) {
      Alert.alert('Could not transcribe', result.reason);
    }
  };
  const transcribing =
    !transcriptText && !pipelineFinished && createdMsAgo < 90_000;

  const goBack = () => {
    router.replace('/(tabs)/ideas');
  };

  /**
   * WHY this tick exists: the transcript patch lands in the store and does
   * re-render, but `transcribing` also depends on elapsed time. Without a tick
   * the pending message could linger on a screen the user is already looking
   * at. One second is enough to feel immediate and costs nothing.
   */
  useEffect(() => {
    const id2 = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id2);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(tabs)/ideas');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const thoughtExists = Boolean(idea);
  useEffect(() => {
    if (id && thoughtExists) void touchIdea(id);
  }, [id, thoughtExists, touchIdea]);

  if (!idea) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={styles.missingText}>Idea not found.</Text>
          <Pressable onPress={goBack}>
            <Text style={styles.link}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const onDeleteConfirm = async () => {
    setConfirmDelete(false);
    await deleteIdea(idea.id);
    router.replace('/(tabs)/ideas');
  };

  /**
   * WHY: the old "Demo transcript — sample text (legacy)" label was shown
   * alongside fabricated content, which read as if the app had transcribed
   * something. When there is no transcript, say so plainly.
   */
  const hasTranscript = Boolean((idea.transcript ?? '').trim());
  void hasTranscript;
  const sourceLabel = isDevice
    ? 'Transcribed on this device'
    : isLive
      ? 'Transcribed from your recording'
      : hasTranscript
        ? 'Sample content — not your recording'
        : 'Transcript not available — audio is saved and can be transcribed later';
  const tint = categoryColor(idea.category);
  const analysis = idea.analysis ?? null;
  const showAnalysis = analysis !== null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.iconBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </Pressable>
        <View style={[styles.brandHit, { pointerEvents: 'none' }]}>
          <Text style={styles.brand}>Think Tap</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => void updateIdea(idea.id, { favorite: !idea.favorite })}
            hitSlop={12}
            style={styles.iconBtn}
          >
            <Ionicons
              name={idea.favorite ? 'star' : 'star-outline'}
              size={22}
              color={idea.favorite ? colors.accent : colors.primary}
            />
          </Pressable>
          <Pressable
            onPress={() => setConfirmDelete(true)}
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityLabel="Delete thought"
          >
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.metaRow}>
          <View style={[styles.category, { backgroundColor: tint.bg }]}>
            <Text style={styles.categoryText}>{idea.category}</Text>
          </View>
          {idea.language?.trim() && spoken ? (
            <Text style={styles.date}>
              {knownLanguage ? `${knownLanguage.flag} ` : ''}
              {spoken.name}
            </Text>
          ) : null}
          <Text style={styles.date}>{relativeDate(idea.createdAt)}</Text>
        </View>

        <Text style={styles.title}>{idea.title}</Text>

        <AudioPlayer uri={idea.audioUri} durationSec={idea.durationSec} />

        <View
          style={[
            styles.sourceBanner,
            isDevice || isLive ? styles.sourceLive : styles.sourceDemo,
          ]}
        >
          <Ionicons
            name={isDevice || isLive ? 'mic' : 'information-circle-outline'}
            size={16}
            color={colors.primary}
          />
          <Text style={styles.sourceText}>{sourceLabel}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mic-outline" size={18} color={colors.secondary} />
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Transcript</Text>
          </View>
          <View style={styles.transcriptCard}>
            {transcribing || retrying ? (
              <View style={styles.transcribingRow}>
                <ActivityIndicator size="small" color={colors.secondary} />
                <Text style={styles.transcribingText}>
                  Transcribing your recording…
                </Text>
              </View>
            ) : qStatus.state === 'waiting' ? (
              <View style={styles.transcribingRow}>
                <ActivityIndicator size="small" color={colors.secondary} />
                <Text style={styles.transcribingText}>
                  Waiting for a connection. Your recording is safe — the
                  transcript will appear on its own once you are online.
                </Text>
              </View>
            ) : qStatus.state === 'retrying' ? (
              <View style={styles.transcribingRow}>
                <ActivityIndicator size="small" color={colors.secondary} />
                <Text style={styles.transcribingText}>
                  Trying again… (attempt {qStatus.attempts + 1}). Your recording
                  is safe — no need to do anything.
                </Text>
              </View>
            ) : qStatus.state === 'failed' ? (
              <View>
                <Text style={styles.transcribingText}>
                  We could not create a transcript after{' '}
                  {qStatus.state === 'failed' ? qStatus.attempts : 0} attempts.
                  The audio is saved — you can play it above.
                </Text>
                <Pressable onPress={() => void onRetry()} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.body}>
                {transcriptText
                  ? idea.transcript
                  : 'No transcript was produced. The audio is saved — play it above. ' +
                    'If this keeps happening, transcription is not configured.'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles-outline" size={18} color={colors.secondary} />
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Analysis</Text>
          </View>
          <Text style={styles.sectionHint}>Response from analyzing the transcript above</Text>

          {showAnalysis ? (
            <View style={styles.analysisStack}>
              {ANALYSIS_FIELDS.map((field) => {
                const value = analysis?.[field.key]?.trim() ?? '';
                return (
                  <View
                    key={field.key}
                    style={[styles.analysisCard, { backgroundColor: field.soft }]}
                  >
                    <View style={[styles.analysisAccent, { backgroundColor: field.accent }]} />
                    <View style={styles.analysisHeader}>
                      <View
                        style={[
                          styles.analysisIcon,
                          { backgroundColor: colors.surfaceContainerLowest },
                        ]}
                      >
                        <Ionicons name={field.icon} size={16} color={field.accent} />
                      </View>
                      <Text style={[styles.analysisLabel, { color: field.accent }]}>
                        {field.label}
                      </Text>
                    </View>
                    <Text style={[styles.body, !value && styles.emptyValue]}>
                      {value || '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.summaryCard}>
              <View style={styles.summaryAccent} />
              <Text style={styles.body}>{idea.summary}</Text>
            </View>
          )}
        </View>
      </ScrollView>
      <DeleteThoughtDialog
        visible={confirmDelete}
        title={idea.title}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDeleteConfirm()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.secondarySoft,
  },
  retryText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.onSecondaryFixedVariant,
  },
  transcribingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transcribingText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
  },
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.containerMargin,
    paddingVertical: spacing.stackMd,
    zIndex: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  brandHit: { flex: 1, alignItems: 'center' },
  brand: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
  },
  topActions: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  content: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: 48,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  category: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  categoryText: {
    color: colors.onPrimary,
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  date: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.headlineLgMobile.fontSize,
    lineHeight: typography.headlineLgMobile.lineHeight,
    color: colors.primary,
    marginBottom: spacing.stackLg,
  },
  sourceBanner: {
    marginTop: spacing.stackMd,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: radii.md,
  },
  sourceLive: { backgroundColor: colors.successSoft },
  sourceDemo: { backgroundColor: colors.surfaceContainer },
  sourceText: {
    flex: 1,
    fontFamily: fonts.label,
    fontSize: 12,
    lineHeight: 18,
    color: colors.primary,
  },
  section: { marginTop: spacing.sectionGap },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.stackSm,
  },
  sectionTitle: {
    fontFamily: fonts.headline,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
    marginBottom: spacing.stackSm,
  },
  sectionTitleInline: { marginBottom: 0 },
  sectionHint: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.stackMd,
  },
  transcriptCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryCard: {
    backgroundColor: colors.secondarySoft,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.secondaryFixed,
    overflow: 'hidden',
  },
  summaryAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.secondary,
  },
  analysisStack: { gap: 12 },
  analysisCard: {
    borderRadius: radii.xl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    paddingLeft: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  analysisAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  analysisIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.labelMd.fontSize,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    color: colors.onSurface,
  },
  emptyValue: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingText: { fontFamily: fonts.body, color: colors.onSurfaceVariant },
  link: { fontFamily: fonts.bodySemi, color: colors.secondary },
});
