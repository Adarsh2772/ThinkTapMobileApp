import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioPlayer } from '@/src/components/AudioPlayer';
import { getLanguage } from '@/src/i18n/languages';
import { useIdeasStore } from '@/src/store/ideasStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';
import { relativeDate } from '@/src/utils/format';

export default function IdeaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const getIdea = useIdeasStore((s) => s.getIdea);
  const updateIdea = useIdeasStore((s) => s.updateIdea);
  const deleteIdea = useIdeasStore((s) => s.deleteIdea);
  const idea = id ? getIdea(id) : undefined;
  const language = idea ? getLanguage(idea.language) : null;
  const isLive = idea?.transcriptSource === 'live';

  if (!idea) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={styles.missingText}>Idea not found.</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const onDelete = () => {
    Alert.alert('Delete idea?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteIdea(idea.id);
          router.replace('/(tabs)/ideas');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={styles.brand}>Think Tap</Text>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => void updateIdea(idea.id, { favorite: !idea.favorite })}
            hitSlop={12}
            style={styles.iconBtn}
          >
            <Ionicons
              name={idea.favorite ? 'star' : 'star-outline'}
              size={22}
              color={colors.primary}
            />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.metaRow}>
          <View style={styles.category}>
            <Text style={styles.categoryText}>{idea.category}</Text>
          </View>
          {language ? (
            <Text style={styles.date}>
              {language.flag} {language.name}
            </Text>
          ) : null}
          <Text style={styles.date}>{relativeDate(idea.createdAt)}</Text>
        </View>

        <Text style={styles.title}>{idea.title}</Text>

        <AudioPlayer uri={idea.audioUri} durationSec={idea.durationSec} />

        <View style={[styles.sourceBanner, isLive ? styles.sourceLive : styles.sourceDemo]}>
          <Ionicons
            name={isLive ? 'mic' : 'information-circle-outline'}
            size={16}
            color={colors.primary}
          />
          <Text style={styles.sourceText}>
            {isLive
              ? 'Live transcript — converted from your recording'
              : 'Demo transcript — add OpenAI API key in Settings for real speech-to-text'}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles" size={18} color={colors.secondary} />
            <Text style={styles.sectionTitle}>AI Summary</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={styles.summaryAccent} />
            <Text style={styles.body}>{idea.summary}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <Text style={styles.body}>{idea.transcript}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.containerMargin,
    paddingVertical: spacing.stackMd,
  },
  iconBtn: { padding: 4 },
  brand: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
  },
  topActions: { flexDirection: 'row', gap: 8 },
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
    backgroundColor: colors.primary,
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
  sourceLive: { backgroundColor: '#DCFCE7' },
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
  summaryCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(196,199,199,0.3)',
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
  body: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    color: colors.onSurface,
  },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingText: { fontFamily: fonts.body, color: colors.onSurfaceVariant },
  link: { fontFamily: fonts.bodySemi, color: colors.secondary },
});
