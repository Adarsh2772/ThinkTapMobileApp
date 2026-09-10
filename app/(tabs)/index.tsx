import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudioSavedModal } from '@/src/components/AudioSavedModal';
import { MicButton } from '@/src/components/MicButton';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { useIdeaCaptureContext } from '@/src/features/capture/IdeaCaptureProvider';
import { useDrawerOptional } from '@/src/navigation/DrawerContext';
import { processPendingRecording } from '@/src/services/processRecording';
import {
  announceRecordingStarted,
  announceRecordingStopped,
} from '@/src/services/recordingFeedback';
import { beginRecordingSession } from '@/src/services/recordingSession';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { usePendingRecordingStore } from '@/src/store/pendingRecordingStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { showToast } from '@/src/store/toastStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const setPending = usePendingRecordingStore((s) => s.setPending);
  const clearPending = usePendingRecordingStore((s) => s.clearPending);
  const addIdea = useIdeasStore((s) => s.addIdea);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  const drawer = useDrawerOptional();
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);

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
  } = useIdeaCaptureContext();

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
        setPausedForRecording(false);
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
      setTimeout(() => setPausedForRecording(false), 1200);
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

  const onMicPress = async () => {
    if (stoppingRef.current || status === 'stopping') return;

    if (isRecording) {
      await finishRecording();
      return;
    }

    const ok = await beginRecordingSession(start);
    if (!ok) {
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
              Saving audio only — live text is off on this Android version. Turn off “Save
              audio recording” in Settings to see live transcription while recording.
            </Text>
          ) : null}
          {isRecording && !isPaused && supportsVoiceStop && !liveTranscript ? (
            <Text style={styles.modeHint}>
              Tap the red button to stop and save, or say “stop recording”
            </Text>
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
