import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/ScreenHeader';
import { VoiceAssistantStage } from '@/src/features/voiceAssistant/VoiceAssistantStage';
import { getSpeechLocale } from '@/src/features/languageTranscript/locales';
import { useIdeaCapture } from '@/src/hooks/useIdeaCapture';
import { useNativeCapture } from '@/src/hooks/useNativeCapture';
import { useDrawerOptional } from '@/src/navigation/DrawerContext';
import { releaseWakeMicForCapture } from '@/src/services/micHandoff';
import { abortLiveRecognition } from '@/src/services/languageTranscriptService';
import { resolveSpokenLanguage } from '@/src/i18n/languages';
import {
  buildLocalIdea,
  enrichPendingRecording,
} from '@/src/services/processRecording';
import type { ProcessingStage } from '@/src/types';
import {
  announceRecordingStarted,
  announceRecordingStopped,
  prefetchRecordingVoice,
} from '@/src/services/recordingFeedback';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { usePendingRecordingStore } from '@/src/store/pendingRecordingStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { showToast } from '@/src/store/toastStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import {
  processTranscriptionQueue,
  queueForTranscription,
  startAutoRetry,
} from '@/src/services/transcriptionQueue';
import { colors, fonts } from '@/src/theme/tokens';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.session?.user);
  const setPending = usePendingRecordingStore((s) => s.setPending);
  const clearPending = usePendingRecordingStore((s) => s.clearPending);
  const addIdea = useIdeasStore((s) => s.addIdea);
  const updateIdea = useIdeasStore((s) => s.updateIdea);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  const drawer = useDrawerOptional();
  const router = useRouter();

  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const triggerAt = useWakeWordStore((s) => s.triggerAt);
  const stopToken = useWakeWordStore((s) => s.stopToken);
  const wakeEnabled = useWakeWordStore((s) => s.enabled);
  const captureStarting = useWakeWordStore((s) => s.captureStarting);
  const setPausedForRecording = useWakeWordStore((s) => s.setPausedForRecording);
  const setCaptureStarting = useWakeWordStore((s) => s.setCaptureStarting);
  const lastTrigger = useRef(0);
  const lastStop = useRef(0);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  /**
   * WHY on foreground rather than a network listener: coming back to the app is
   * the moment the user might look for the transcript, and it avoids holding a
   * connectivity subscription for the whole session. Exits immediately when the
   * queue is empty.
   */
  useEffect(() => {
    if (appState !== 'active') return;
    void processTranscriptionQueue();
    /**
     * WHY both: the foreground drain catches the common case of returning to
     * the app, and the poller covers turning a connection on while already
     * inside it - which the foreground event never fires for. It stops itself
     * once the queue empties.
     */
    startAutoRetry();
  }, [appState]);

  /**
   * WHY a second drain on mount: the effect above only fires on an appState
   * change. A cold start is already 'active', so nothing ran until the user
   * backgrounded and returned. Recordings queued in a previous session sat
   * waiting for an event that never came.
   */
  useEffect(() => {
    void processTranscriptionQueue();
  }, []);

  useEffect(() => {
    prefetchRecordingVoice();
  }, []);

  const [organizing, setOrganizing] = useState(false);
  const [organizeStage, setOrganizeStage] = useState<ProcessingStage>('uploading');
  const [detectedLanguageName, setDetectedLanguageName] = useState<string | null>(null);
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
    speechLocale,
  } = useIdeaCapture({
    onCaptureFailed: (message) => {
      showToast(message, 'error');
      Alert.alert('Cannot record', message);
    },
    onInterrupted: () => {
      showToast('Recording paused — call in progress', 'info');
    },
    onSilencePause: () => {
      showToast('Recording paused — no speech for 10 seconds', 'info');
    },
  });
  const stoppingRef = useRef(false);
  const finishLockRef = useRef(false);
  const pauseBusyRef = useRef(false);

  /**
   * Android capture, driven by the native single-microphone service.
   *
   * WHY a separate hook: useIdeaCapture orchestrated a microphone handoff
   * between the wake recogniser and expo-audio. That handshake is what broke
   * per device. The native service owns the mic outright, so the screen only
   * sends state transitions and waits for the finished file.
   */
  const nativeFinishRef = useRef<((r: { uri: string; durationSec: number }) => void) | null>(null);
  const native = useNativeCapture({
    onWake: () => {
      if (native.isRecording) return;
      void native.start();
    },
    onFinished: (result) => {
      nativeFinishRef.current?.(result);
    },
    onError: (message) => showToast(message, 'error'),
    onInterrupted: () => showToast('Paused — call in progress', 'info'),
    onCallEnded: () =>
      showToast('Call ended. Say “Hey ThinkTap resume” or tap Resume.', 'info'),
  });
  const useNativePath = native.supported;

  const runOrganizeInBackground = useCallback(
    async (pending: {
      audioUri: string;
      durationSec: number;
      transcript: string;
      speechLocale: string;
    }) => {
      if (!user || processLockRef.current) return;
      processLockRef.current = true;
      setOrganizeStage('uploading');
      setDetectedLanguageName(null);
      setOrganizing(true);

      const localIdea = buildLocalIdea(user.id, pending, languageCode);
      try {
        await addIdea(localIdea);
        clearPending();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not save this recording';
        showToast(message, 'error');
        setOrganizing(false);
        processLockRef.current = false;
        return;
      }

      try {
        const patch = await enrichPendingRecording(pending, languageCode, (stage) => {
          setOrganizeStage(stage);
        });
        /**
         * WHY queue on empty text: the audio is already saved, so nothing is
         * lost - but without a retry the transcript stayed empty forever after
         * one offline attempt. Queued takes are retried when the app next opens
         * with a connection.
         */
        if (!patch || !(patch.transcript ?? '').trim()) {
          if (pending.audioUri) {
            void queueForTranscription({
              ideaId: localIdea.id,
              audioUri: pending.audioUri,
              durationSec: pending.durationSec,
              speechLocale: pending.speechLocale,
              languageCode,
            });
            startAutoRetry();
            showToast('Saved. Transcript will be added when you are back online.', 'info');
          }
        }
        if (patch && (patch.transcript || patch.title)) {
          if (patch.language && patch.transcript) {
            setDetectedLanguageName(resolveSpokenLanguage(patch.language).name);
          }
          setOrganizeStage('done');
          await updateIdea(localIdea.id, patch);
          showToast('Transcript ready — open it in Ideas');
        }
      } catch (e) {
        console.warn('Transcription failed after save', e);
        if (pending.audioUri) {
          void queueForTranscription({
            ideaId: localIdea.id,
            audioUri: pending.audioUri,
            durationSec: pending.durationSec,
            speechLocale: pending.speechLocale,
            languageCode,
          });
        }
        showToast('Saved. The transcript will be added when the network is back.', 'info');
      } finally {
        setOrganizing(false);
        processLockRef.current = false;
      }
    },
    [user, languageCode, addIdea, updateIdea, clearPending],
  );

  /** Shared save path for both the native and legacy capture routes. */
  const savePending = useCallback(
    async (pending: {
      audioUri: string;
      durationSec: number;
      transcript: string;
      speechLocale: string;
    }) => {
      showToast('Saved. Preparing your transcript…');
      await announceRecordingStopped();
      setPending(pending);
      void runOrganizeInBackground(pending);
    },
    [setPending, runOrganizeInBackground],
  );

  // A native take finished — no transcript yet; Whisper produces it from the file.
  nativeFinishRef.current = (result) => {
    void savePending({
      audioUri: result.uri,
      durationSec: result.durationSec,
      transcript: '',
      speechLocale,
    });
  };

  const finishRecording = useCallback(async () => {
    if (useNativePath) {
      await native.stop();
      return;
    }
    if (finishLockRef.current || stoppingRef.current) return;
    finishLockRef.current = true;
    stoppingRef.current = true;
    setPausedForRecording(true);
    try {
      const result = await stop();
      if (!result) {
        const reason = getLastError() ?? 'Nothing was captured in this take.';
        showToast(reason, 'error');
        return;
      }
      // Mic already closed — announce only after stop so TTS never enters the file.
      await announceRecordingStopped();
      // Let wake listening resume quickly after stop (was ~4s dead zone).
      setPausedForRecording(false);
      const pending = {
        audioUri: result.uri,
        durationSec: result.durationSec,
        transcript: result.transcript,
        speechLocale: result.speechLocale,
      };
      setPending(pending);
      // Transcribe after the stop announcement so the file is already finalized.
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
    useNativePath,
    native,
  ]);

  const onPausePress = useCallback(async () => {
    if (pauseBusyRef.current || stoppingRef.current) return;
    pauseBusyRef.current = true;
    try {
      const ok = useNativePath ? await native.pause() : await pause();
      if (ok) showToast('Recording paused');
      else showToast(error ?? 'Could not pause', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  }, [pause, error, useNativePath, native]);

  const onResumePress = useCallback(async () => {
    if (pauseBusyRef.current || stoppingRef.current) return;
    pauseBusyRef.current = true;
    try {
      const ok = useNativePath ? await native.resume() : await resume();
      if (ok) showToast('Recording resumed');
      else showToast(error ?? 'Could not resume', 'error');
    } finally {
      pauseBusyRef.current = false;
    }
  }, [resume, error, useNativePath, native]);

  // OS STT session: spoken Stop / Pause / Resume.
  useEffect(() => {
    setVoiceStopHandler(() => {
      void finishRecording();
    });
    setVoicePauseHandler(() => {
      void onPausePress();
    });
    setVoiceResumeHandler(() => {
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

  // "Hey Think Tap" / "start recording" → start capture once the wake mic is free
  // and the app is in the foreground (SpeechRecognizer cannot start from background).
  // WakeWordProvider already routes to Home for this token.
  useEffect(() => {
    // WHY skipped on the native path: useNativeCapture's onWake starts the
    // take directly from the service event. Running both would start twice.
    if (useNativePath) return;
    if (!triggerToken || triggerToken === lastTrigger.current) return;
    // Wait until foreground — do not consume the token yet.
    if (appState !== 'active') return;
    if (Date.now() - triggerAt > 30_000) {
      lastTrigger.current = triggerToken;
      setCaptureStarting(false);
      return;
    }
    // While stopping, keep the token so we retry when idle (do not consume).
    if (status === 'stopping' || stoppingRef.current) return;
    // Already recording — ignore this wake.
    if (isRecording) {
      lastTrigger.current = triggerToken;
      setCaptureStarting(false);
      return;
    }

    lastTrigger.current = triggerToken;
    // Holds the wake listener off for the whole handoff. Releasing the mic
    // takes a few seconds, and without this the listener's resume timer can
    // grab the mic back before the recognizer has it.
    setCaptureStarting(true);
    void (async () => {
      try {
        // Overlap wake-mic release with instant vibrate/toast so start feels immediate.
        await Promise.all([releaseWakeMicForCapture(), announceRecordingStarted()]);
        abortLiveRecognition();
        const ok = await start();
        if (!ok) {
          showToast('Could not start recording', 'error');
          Alert.alert('Hey Think Tap', 'Heard the wake phrase, but recording could not start.');
          return;
        }
      } finally {
        setCaptureStarting(false);
      }
    })();
  }, [triggerToken, triggerAt, appState, isRecording, status, start, setCaptureStarting]);

  // Spoken "stop recording" from the native service (app minimized) or a
  // pending stop consumed when the activity became visible again.
  useEffect(() => {
    if (!stopToken || stopToken === lastStop.current) return;
    lastStop.current = stopToken;
    if (!isRecording && status !== 'stopping') return;
    if (stoppingRef.current) return;
    void finishRecording();
  }, [stopToken, isRecording, status, finishRecording]);

  const onMicPress = async () => {
    if (useNativePath) {
      /**
       * WHY no mic handoff here: the native service already owns the
       * microphone. Starting a take is a state change, not a handover, so
       * there is nothing to release or wait for.
       */
      if (native.isRecording) {
        await native.stop();
        return;
      }
      /**
       * WHY the toast waits for confirmation: native.start() now resolves only
       * once the service reports it is actually recording. Announcing before
       * that told the user "Recording started" for takes that never began -
       * reported on OPPO A51 / Android 11.
       */
      const ok = await native.start();
      if (ok) {
        showToast('Recording — your transcript appears after you stop');
        void announceRecordingStarted();
      }
      // Failure already surfaced through onError.
      return;
    }

    if (stoppingRef.current || status === 'stopping') return;

    if (isRecording) {
      await finishRecording();
      return;
    }

    setCaptureStarting(true);
    try {
      // Overlap wake-mic release with instant vibrate/toast — do not wait for TTS.
      await Promise.all([releaseWakeMicForCapture(), announceRecordingStarted()]);
      abortLiveRecognition();
      const ok = await start();
      if (!ok) {
        showToast(error ?? 'Microphone permission required', 'error');
        if (error) Alert.alert('Microphone', error);
        return;
      }
    } finally {
      setCaptureStarting(false);
    }
  };

  const onLongDiscard = () => {
    if (!(useNativePath ? native.isRecording : isRecording)) return;
    Alert.alert('Discard recording?', 'This will delete the current take.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (useNativePath) await native.discard();
            else await discard();
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
              /* WHY Settings, not the drawer: the avatar reads as a profile
                 control, so users expected it to open their settings. */
              onPress={() => router.push('/(tabs)/settings')}
              style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.avatarText}>
                {(user?.firstName?.[0] ?? 'T').toUpperCase()}
              </Text>
            </Pressable>
          }
        />

        <View style={styles.content}>
          <VoiceAssistantStage
            isRecording={
              useNativePath
                ? native.isRecording || native.status === 'stopping'
                : isRecording || status === 'stopping'
            }
            isPaused={useNativePath ? native.isPaused : isPaused}
            isStarting={
              useNativePath
                ? false
                : captureStarting && !isRecording && status !== 'stopping'
            }
            durationSec={useNativePath ? native.durationSec : durationSec}
            liveTranscript={liveTranscript}
            wakeEnabled={wakeEnabled}
            supportsVoiceStop={supportsVoiceStop}
            speechLocaleName={undefined}
            onPress={() => void onMicPress()}
            onPause={() => void onPausePress()}
            onResume={() => void onResumePress()}
            onLongPress={onLongDiscard}
            labelIdle={tx('tapToRecord')}
            labelRecording={
              (useNativePath ? native.status : status) === 'stopping'
                ? 'Stopping…'
                : tx('recording')
            }
            labelPaused={
              useNativePath && native.callHold
                ? 'Paused for a call — say “Hey ThinkTap resume” or tap Resume'
                : 'Paused — tap Resume or say “Hey ThinkTap resume”'
            }
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: {
    flex: 1,
    paddingHorizontal: 20,
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
});
