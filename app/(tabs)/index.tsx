import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdeaCard } from '@/src/components/IdeaCard';
import { MicButton } from '@/src/components/MicButton';
import { useRecording } from '@/src/hooks/useRecording';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { usePendingRecordingStore } from '@/src/store/pendingRecordingStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const allIdeas = useIdeasStore((s) => s.ideas);
  const setPending = usePendingRecordingStore((s) => s.setPending);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const wakeListening = useWakeWordStore((s) => s.listening);
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);
  const lastTrigger = useRef(0);
  void languageCode;
  const ideas = useMemo(() => {
    if (!user) return [];
    return allIdeas
      .filter((idea) => idea.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);
  }, [allIdeas, user]);
  const { isRecording, durationSec, error, start, stop, discard } = useRecording();

  // Free the mic for recording / return it to wake listening afterward.
  useEffect(() => {
    setPausedForRecording(isRecording);
  }, [isRecording, setPausedForRecording]);

  // "Hey Think Tap" → start recording on Home.
  useEffect(() => {
    if (!triggerToken || triggerToken === lastTrigger.current) return;
    lastTrigger.current = triggerToken;
    if (isRecording) return;
    setPausedForRecording(true);
    void (async () => {
      const ok = await start();
      if (!ok) {
        setPausedForRecording(false);
        Alert.alert('Hey Think Tap', 'Heard the wake phrase, but recording could not start.');
      }
    })();
  }, [triggerToken, isRecording, start, setPausedForRecording]);

  const onMicPress = async () => {
    if (isRecording) {
      const result = await stop();
      if (!result) {
        Alert.alert('Recording', error ?? 'Could not save recording');
        return;
      }
      // Keep file URI in memory — never pass file:// through route params.
      setPending({
        audioUri: result.uri,
        durationSec: result.durationSec,
      });
      router.push('/processing');
      return;
    }

    const ok = await start();
    if (!ok && error) {
      Alert.alert('Microphone', error);
    }
  };

  const onLongDiscard = () => {
    if (!isRecording) return;
    Alert.alert('Discard recording?', 'This will delete the current take.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discard() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Hello, {user?.firstName ?? 'Creator'}</Text>
            <Text style={styles.ready}>{tx('readyForIdea')}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.firstName?.[0] ?? 'T').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{tx('recentIdeas')}</Text>
          <Pressable onPress={() => router.push('/(tabs)/ideas')}>
            <Text style={styles.viewAll}>{tx('viewAll')}</Text>
          </Pressable>
        </View>

        <View style={styles.list}>
          {ideas.length === 0 ? (
            <Text style={styles.empty}>No ideas yet — tap the mic to capture your first one.</Text>
          ) : (
            ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onPress={() => router.push(`/idea/${idea.id}`)}
              />
            ))
          )}
        </View>

        <Pressable onLongPress={onLongDiscard} delayLongPress={500}>
          <MicButton
            isRecording={isRecording}
            durationSec={durationSec}
            onPress={() => void onMicPress()}
            labelIdle={tx('tapToRecord')}
            labelRecording={tx('recording')}
            helperIdle={tx('aiTranscribeHint')}
          />
        </Pressable>
        {wakeEnabled && !isRecording ? (
          <Text style={styles.wakeHint}>
            {wakeListening
              ? 'Listening for “Hey Think Tap”…'
              : 'Wake word on — say “Hey Think Tap” to record'}
          </Text>
        ) : null}
        {error && !isRecording ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.stackMd,
  },
  hello: {
    fontFamily: fonts.headlineExtra,
    fontSize: typography.headlineLgMobile.fontSize,
    lineHeight: typography.headlineLgMobile.lineHeight,
    color: colors.primary,
  },
  ready: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bodySemi,
    color: colors.primary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.stackMd,
    marginTop: spacing.stackSm,
  },
  sectionTitle: {
    fontFamily: fonts.headline,
    fontSize: typography.titleMd.fontSize,
    color: colors.onBackground,
  },
  viewAll: {
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.secondary,
  },
  list: { gap: spacing.stackMd, marginBottom: spacing.sectionGap },
  empty: {
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 22,
  },
  wakeHint: {
    marginTop: spacing.stackMd,
    textAlign: 'center',
    color: colors.onSurfaceVariant,
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
  },
  error: {
    marginTop: spacing.stackMd,
    textAlign: 'center',
    color: colors.error,
    fontFamily: fonts.label,
  },
});
