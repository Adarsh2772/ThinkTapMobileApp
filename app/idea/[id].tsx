import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioPlayer } from '@/src/components/AudioPlayer';
import { DeleteThoughtDialog } from '@/src/components/DeleteThoughtDialog';
import { findLanguageByWhisperCode, resolveSpokenLanguage } from '@/src/i18n/languages';
import { useIdeasStore } from '@/src/store/ideasStore';
import { categoryColor, colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';
import { relativeDate } from '@/src/utils/format';

export default function IdeaDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const idea = useIdeasStore((s) => (id ? s.ideas.find((item) => item.id === id) : undefined));
  const updateIdea = useIdeasStore((s) => s.updateIdea);
  const deleteIdea = useIdeasStore((s) => s.deleteIdea);
  const touchIdea = useIdeasStore((s) => s.touchIdea);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const knownLanguage = idea ? findLanguageByWhisperCode(idea.language) : undefined;
  const spoken = idea ? resolveSpokenLanguage(idea.language) : null;
  const isLive = idea?.transcriptSource === 'live';
  const isDevice = idea?.transcriptSource === 'device';

  const goBack = () => {
    router.replace('/(tabs)/ideas');
  };

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

  const sourceLabel = isDevice
    ? 'Device transcript — saved in the language you spoke'
    : isLive
      ? 'Live transcript — auto-detected language from your recording'
      : 'Demo transcript — sample text (legacy)';
  const tint = categoryColor(idea.category);

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
            <Text style={styles.body}>
              {idea.transcript?.trim()
                ? idea.transcript
                : 'Recording is not clear. Please record properly.'}
            </Text>
          </View>
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
  reanalyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: spacing.stackMd,
    borderRadius: radii.md,
    backgroundColor: colors.secondarySoft,
  },
  reanalyzeText: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.labelMd.fontSize,
    color: colors.secondary,
  },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingText: { fontFamily: fonts.body, color: colors.onSurfaceVariant },
  link: { fontFamily: fonts.bodySemi, color: colors.secondary },
});
