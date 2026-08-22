import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioSavedModal } from '@/src/components/AudioSavedModal';
import { MicButton } from '@/src/components/MicButton';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { useIdeaCapture } from '@/src/hooks/useIdeaCapture';
import { useDrawerOptional } from '@/src/navigation/DrawerContext';
import { releaseWakeMicForCapture } from '@/src/services/micHandoff';
import { processPendingRecording } from '@/src/services/processRecording';
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
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const setPending = usePendingRecordingStore((s) => s.setPending);
  const clearPending = usePendingRecordingStore((s) => s.clearPending);
  const addIdea = useIdeasStore((s) => s.addIdea);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  const drawer = useDrawerOptional();
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);
  const lastTrigger = useRef(0);

  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const processLockRef = useRef(false);

  const {
    isRecording,
    isPaused,
    durationSec,
    error,
    getLastError,
    start,
    pause,
    resume,
    stop,
    discard,
    status,
    setVoiceStopHandler,
    setVoicePauseHandler,
    setVoiceResumeHandler,
    supportsVoiceStop,
    liveTranscript,
  } = useIdeaCapture();
  const stoppingRef = useRef(false);
  const finishLockRef = useRef(false);
  const pauseBusyRef = useRef(false);

  const runOrganizeInBackground = useCallback(
    async (pending: {
      audioUri: string;
      durationSec: number;
      transcript: string;
      speechLocale: string;
    }) => {
      if (!user || processLockRef.current) return;
      processLockRef.current = true;
      setOrganizing(true);
      try {
        const idea = await processPendingRecording({
          userId: user.id,
          pending,
          languageCode,
        });
        await addIdea(idea);
        clearPending();
        showToast('Idea ready in Ideas');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not organize this idea';
        showToast(message, 'error');
        clearPending();
      } finally {
        setOrganizing(false);
        processLockRef.current = false;
      }
    },
    [user, languageCode, addIdea, clearPending],
  );

  const finishRecording = useCallback(async () => {
    if (finishLockRef.current || stoppingRef.current) return;
    finishLockRef.current = true;
    stoppingRef.current = true;
    setPausedForRecording(true);
    try {
      const result = await stop();
      if (!result) {
        const reason = getLastError() ?? 'Nothing was captured in this take.';
        showToast(reason, 'error');
        Alert.alert('Recording stopped', reason);
        return;
      }
      showToast('Recording stopped');
      await announceRecordingStopped();
      const pending = {
        audioUri: result.uri,
        durationSec: result.durationSec,
        transcript: result.transcript,
        speechLocale: result.speechLocale,
      };
      setPending(pending);
      setSaveModalVisible(true);
      void runOrganizeInBackground(pending);
    } finally {
      stoppingRef.current = false;
      finishLockRef.current = false;
    }
  }, [
    stop,
    getLastError,
    setPausedForRecording,
    setPending,
    runOrganizeInBackground,
  ]);

  const onPausePress = useCallback(async () => {
    if (pauseBusyRef.current || stoppingRef.current) return;
    pauseBusyRef.current = true;
    try {
      const ok = await pause();
      if (ok) showToast('Recording paused');
      else showToast(error ?? 'Could not pause', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  }, [pause, error]);

  const onResumePress = useCallback(async () => {
    if (pauseBusyRef.current || stoppingRef.current) return;
    pauseBusyRef.current = true;
    try {
      const ok = await resume();
      if (ok) showToast('Recording resumed');
      else showToast(error ?? 'Could not resume', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  }, [resume, error]);

  // OS STT session: spoken Stop / Pause / Resume.
  useEffect(() => {
    setVoiceStopHandler(() => {
      showToast('Heard “Stop” — finishing recording');
      void finishRecording();
    });
    setVoicePauseHandler(() => {
      showToast('Heard “Pause”');
      void onPausePress();
    });
    setVoiceResumeHandler(() => {
      showToast('Heard “Resume”');
      void onResumePress();
    });
    return () => {
      setVoiceStopHandler(null);
      setVoicePauseHandler(null);
      setVoiceResumeHandler(null);
    };
  }, [
    setVoiceStopHandler,
    setVoicePauseHandler,
    setVoiceResumeHandler,
    finishRecording,
    onPausePress,
    onResumePress,
  ]);

  // "Hey Think Tap" / "start recording" → Home → start capture after the wake mic is free.
  useEffect(() => {
    if (!triggerToken || triggerToken === lastTrigger.current) return;
    lastTrigger.current = triggerToken;
    if (isRecording || status === 'stopping' || stoppingRef.current) return;

    router.replace('/(tabs)');

    void (async () => {
      await releaseWakeMicForCapture();
      const ok = await start();
      if (!ok) {
        setPausedForRecording(false);
        showToast('Could not start recording', 'error');
        Alert.alert('Hey Think Tap', 'Heard the wake phrase, but recording could not start.');
        return;
      }
      showToast('Recording started');
      await announceRecordingStarted();
    })();
  }, [triggerToken, isRecording, status, start, setPausedForRecording, router]);

  const onMicPress = async () => {
    if (stoppingRef.current || status === 'stopping') return;

    if (isRecording) {
      await finishRecording();
      return;
    }

    await releaseWakeMicForCapture();
    const ok = await start();
    if (!ok) {
      setPausedForRecording(false);
      showToast(error ?? 'Microphone permission required', 'error');
      if (error) Alert.alert('Microphone', error);
      return;
    }
    showToast('Recording started');
    await announceRecordingStarted();
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
      <View style={styles.page}>
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

        <View style={styles.content}>
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
            helperIdle=""
          />
          {isRecording && !isPaused && !supportsVoiceStop ? (
            <Text style={styles.modeHint}>
              Saving audio — spoken commands are off. Tap Stop to finish.
            </Text>
          ) : null}
          {isRecording && !isPaused && supportsVoiceStop && !liveTranscript ? (
            <Text style={styles.modeHint}>Say “stop recording” or tap Stop</Text>
          ) : null}
          {isRecording && !isPaused && liveTranscript ? (
            <Text style={styles.liveTranscript} numberOfLines={4}>
              {liveTranscript}
            </Text>
          ) : null}
          {isPaused && supportsVoiceStop ? (
            <Text style={styles.liveTranscript}>Paused — say “Resume” or “Stop”</Text>
          ) : null}
        </View>
      </View>

      <AudioSavedModal
        visible={saveModalVisible}
        organizing={organizing}
        onClose={() => setSaveModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: {
    flex: 1,
    paddingHorizontal: spacing.containerMargin,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
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
  modeHint: {
    marginTop: spacing.stackMd,
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: typography.labelMd.fontSize,
    lineHeight: typography.labelMd.lineHeight,
    paddingHorizontal: 24,
  },
  liveTranscript: {
    marginTop: spacing.stackMd,
    textAlign: 'center',
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
});
