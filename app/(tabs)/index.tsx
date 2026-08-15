import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdeaCard } from '@/src/components/IdeaCard';
import { MicButton } from '@/src/components/MicButton';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { useIdeaCapture } from '@/src/hooks/useIdeaCapture';
import { getSpeechLocale } from '@/src/features/languageTranscript/locales';
import { useDrawerOptional } from '@/src/navigation/DrawerContext';
import {
  announceRecordingStarted,
  announceRecordingStopped,
} from '@/src/services/recordingFeedback';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { usePendingRecordingStore } from '@/src/store/pendingRecordingStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { showToast } from '@/src/store/toastStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const allIdeas = useIdeasStore((s) => s.ideas);
  const setPending = usePendingRecordingStore((s) => s.setPending);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const speechLocale = useSettingsStore((s) => s.speechLocale);
  const tx = useSettingsStore((s) => s.tx);
  const speechLang = getSpeechLocale(speechLocale);
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const wakeListening = useWakeWordStore((s) => s.listening);
  const wakeLastHeard = useWakeWordStore((s) => s.lastHeard);
  const wakeAvailable = useWakeWordStore((s) => s.available);
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);
  const lastTrigger = useRef(0);
  const drawer = useDrawerOptional();
  void languageCode;

  const ideas = useMemo(() => {
    if (!user) return [];
    return allIdeas
      .filter((idea) => idea.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);
  }, [allIdeas, user]);

  const {
    isRecording,
    isPaused,
    durationSec,
    error,
    start,
    pause,
    resume,
    stop,
    discard,
    status,
    setVoiceStopHandler,
    liveTranscript,
  } = useIdeaCapture();
  const stoppingRef = useRef(false);
  const finishLockRef = useRef(false);
  const pauseBusyRef = useRef(false);

  const finishRecording = useCallback(async () => {
    if (finishLockRef.current || stoppingRef.current) return;
    finishLockRef.current = true;
    stoppingRef.current = true;
    setPausedForRecording(true);
    try {
      const result = await stop();
      if (!result) {
        showToast(error ?? 'Could not stop recording', 'error');
        Alert.alert('Recording', error ?? 'Could not stop recording. Try again.');
        return;
      }
      showToast('Recording stopped');
      await announceRecordingStopped();
      setPending({
        audioUri: result.uri,
        durationSec: result.durationSec,
        transcript: result.transcript,
        speechLocale: result.speechLocale,
      });
      router.push('/processing');
    } finally {
      stoppingRef.current = false;
      finishLockRef.current = false;
    }
  }, [stop, error, setPausedForRecording, setPending, router]);

  // OS STT session calls this when user says "Stop".
  useEffect(() => {
    setVoiceStopHandler(() => {
      showToast('Heard “Stop” — finishing recording');
      void finishRecording();
    });
    return () => setVoiceStopHandler(null);
  }, [setVoiceStopHandler, finishRecording]);

  // Pause wake word while a take is open (recording or paused); delay resume after stop.
  useEffect(() => {
    if (isRecording || status === 'stopping' || status === 'paused') {
      setPausedForRecording(true);
      return;
    }
    const timer = setTimeout(() => {
      setPausedForRecording(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, [isRecording, status, setPausedForRecording]);

  // "Hey Think Tap" → Home → start recording.
  useEffect(() => {
    if (!triggerToken || triggerToken === lastTrigger.current) return;
    lastTrigger.current = triggerToken;
    if (isRecording || status === 'stopping' || stoppingRef.current) return;

    setPausedForRecording(true);
    router.replace('/(tabs)');

    void (async () => {
      showToast('Hey Think Tap — recording started');
      await announceRecordingStarted();
      // Give wake FGS / in-app listener time to release the mic before recording.
      await new Promise((r) => setTimeout(r, 450));
      const ok = await start();
      if (!ok) {
        setPausedForRecording(false);
        showToast('Could not start recording', 'error');
        Alert.alert('Hey Think Tap', 'Heard the wake phrase, but recording could not start.');
      }
    })();
  }, [triggerToken, isRecording, status, start, setPausedForRecording, router]);

  const onMicPress = async () => {
    if (stoppingRef.current || status === 'stopping') return;

    if (isRecording) {
      await finishRecording();
      return;
    }

    setPausedForRecording(true);
    showToast('Recording started');
    await announceRecordingStarted();
    const ok = await start();
    if (!ok) {
      setPausedForRecording(false);
      showToast(error ?? 'Microphone permission required', 'error');
      if (error) Alert.alert('Microphone', error);
    }
  };

  const onPausePress = async () => {
    if (pauseBusyRef.current || stoppingRef.current || !isRecording || isPaused) return;
    pauseBusyRef.current = true;
    try {
      const ok = await pause();
      if (ok) showToast('Recording paused');
      else showToast(error ?? 'Could not pause', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  };

  const onResumePress = async () => {
    if (pauseBusyRef.current || stoppingRef.current || !isPaused) return;
    pauseBusyRef.current = true;
    try {
      const ok = await resume();
      if (ok) showToast('Recording resumed');
      else showToast(error ?? 'Could not resume', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  };

  const onLongDiscard = () => {
    if (!isRecording) return;
    Alert.alert('Discard recording?', 'This will delete the current take.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await discard();
            showToast('Recording discarded', 'info');
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title={`Hello, ${user?.firstName ?? 'Creator'}`}
          subtitle={tx('readyForIdea')}
          right={
            <Pressable
              onPress={() => drawer?.openDrawer()}
              style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.avatarText}>
                {(user?.firstName?.[0] ?? 'T').toUpperCase()}
              </Text>
            </Pressable>
          }
        />

        <View style={styles.heroBand}>
          <Text style={styles.heroLabel}>Voice capture</Text>
          <Text style={styles.heroBody}>
            Speak in {speechLang.nativeName} — ideas land in your archive instantly.
          </Text>
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

        <MicButton
          isRecording={isRecording || status === 'stopping'}
          isPaused={isPaused}
          durationSec={durationSec}
          onPress={() => void onMicPress()}
          onPause={() => void onPausePress()}
          onResume={() => void onResumePress()}
          onLongPress={onLongDiscard}
          labelIdle={tx('tapToRecord')}
          labelRecording={status === 'stopping' ? 'Stopping…' : tx('recording')}
          labelPaused="Paused — tap Resume to continue"
          helperIdle={`Transcribe in ${speechLang.nativeName} — change in Settings`}
        />
        {isRecording && !isPaused ? (
          <View style={styles.liveBox}>
            <Text style={styles.wakeHint}>
              Listening as {speechLang.name} ({speechLang.nativeName}) — speak this language
            </Text>
            {liveTranscript ? (
              <Text style={styles.liveTranscript} numberOfLines={4}>
                {liveTranscript}
              </Text>
            ) : null}
          </View>
        ) : null}
        {isPaused ? (
          <Text style={styles.wakeHint}>
            Recording paused — tap Resume to continue, or Stop to finish
          </Text>
        ) : null}
        {!isRecording ? (
          <Text style={styles.wakeHint}>
            Transcription: {speechLang.nativeName} · change under Settings
          </Text>
        ) : null}

        {wakeEnabled && !isRecording ? (
          <Text style={styles.wakeHint}>
            {wakeAvailable === false
              ? 'Wake word unavailable — check mic / notification permissions.'
              : wakeListening
                ? wakeLastHeard
                  ? `Listening… heard “${wakeLastHeard}”`
                  : Platform.OS === 'android'
                    ? 'Listening (notification on) — works when minimized'
                    : 'Listening for “Hey Think Tap”…'
                : Platform.OS === 'android'
                  ? 'Wake word on — keep the listening notification enabled'
                  : 'Wake word on — say “Hey Think Tap” clearly'}
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
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bodySemi,
    color: colors.onPrimary,
  },
  heroBand: {
    backgroundColor: colors.secondarySoft,
    borderRadius: radii.card,
    padding: spacing.stackMd,
    borderWidth: 1,
    borderColor: colors.secondaryFixed,
    marginBottom: spacing.stackMd,
  },
  heroLabel: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSecondaryFixedVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroBody: {
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: 22,
    color: colors.onSurface,
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
  liveBox: {
    marginTop: spacing.stackSm,
    marginHorizontal: 4,
    padding: spacing.stackMd,
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.accent + '33',
  },
  liveTranscript: {
    textAlign: 'center',
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: 22,
  },
  error: {
    marginTop: spacing.stackMd,
    textAlign: 'center',
    color: colors.error,
    fontFamily: fonts.label,
  },
});
