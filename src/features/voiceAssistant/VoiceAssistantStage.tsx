import { StyleSheet, Text, View } from 'react-native';

import { MicButton } from '@/src/components/MicButton';
import { VoiceListeningOrb } from '@/src/features/voiceAssistant/VoiceListeningOrb';
import { VoiceWaveform } from '@/src/features/voiceAssistant/VoiceWaveform';
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';
import { formatClock } from '@/src/utils/format';

type Props = {
  isRecording: boolean;
  isPaused?: boolean;
  isStarting?: boolean;
  durationSec: number;
  liveTranscript?: string;
  transcribingPlaceholder?: boolean;
  wakeEnabled?: boolean;
  supportsVoiceStop?: boolean;
  speechLocaleName?: string;
  onPress: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onLongPress?: () => void;
  labelIdle?: string;
  labelRecording?: string;
  labelPaused?: string;
};

/**
 * Assistant-style listening stage. Wraps the existing mic controls; does not
 * start or stop capture itself.
 */
export function VoiceAssistantStage({
  isRecording,
  isPaused = false,
  isStarting = false,
  durationSec,
  liveTranscript,
  transcribingPlaceholder = false,
  wakeEnabled = false,
  supportsVoiceStop = true,
  speechLocaleName,
  onPress,
  onPause,
  onResume,
  onLongPress,
  labelIdle = 'Tap to Record',
  labelRecording = 'Recording…',
  labelPaused = 'Paused',
}: Props) {
  const listening = isStarting || (isRecording && !isPaused);
  const showSession = isRecording || isStarting;

  const statusTitle = isStarting
    ? 'ThinkTap is listening…'
    : isPaused
      ? 'Paused'
      : isRecording
        ? labelRecording === 'Stopping…'
          ? 'Stopping…'
          : 'ThinkTap is listening…'
        : wakeEnabled
          ? 'Say “Hey Think” or “Hey ThinkTap”'
          : labelIdle;

  const statusHint = isStarting
    ? 'Starting your thought…'
    : isPaused
      ? supportsVoiceStop
        ? 'Say “Resume” or “Hey ThinkTap, stop”'
        : 'Tap Resume to continue'
      : isRecording
        ? supportsVoiceStop
          ? 'Pause, then say “Stop recording” — or tap the red Stop'
          : 'Tap the red Stop to finish'
        : wakeEnabled
          ? 'Or tap the mic to record'
          : '';

  return (
    <View style={styles.wrap}>
      <View style={styles.orbStage}>
        <VoiceListeningOrb
          active={listening}
          paused={isPaused && isRecording}
          idleReady={wakeEnabled && !showSession}
        />
        <MicButton
          hideAmbientRings
          isRecording={isRecording}
          isPaused={isPaused}
          durationSec={durationSec}
          onPress={onPress}
          onPause={onPause}
          onResume={onResume}
          onLongPress={onLongPress}
          labelIdle=""
          labelRecording=""
          labelPaused=""
          helperIdle=""
        />
      </View>

      <Text style={styles.status} accessibilityRole="header">
        {statusTitle}
      </Text>
      {showSession ? (
        <Text style={styles.clock}>{formatClock(durationSec)}</Text>
      ) : null}
      {statusHint ? <Text style={styles.hint}>{statusHint}</Text> : null}

      <VoiceWaveform active={listening} />

      {isRecording && speechLocaleName ? (
        <Text style={styles.hint}>Live preview: {speechLocaleName}</Text>
      ) : null}
      {isRecording && !isPaused && liveTranscript ? (
        <Text style={styles.transcript} numberOfLines={4}>
          {liveTranscript}
        </Text>
      ) : isRecording && !isPaused && transcribingPlaceholder ? (
        <Text style={styles.transcript}>Transcript will appear after you stop</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: '100%',
  },
  orbStage: {
    width: 280,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    marginTop: spacing.stackSm,
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
    textAlign: 'center',
  },
  clock: {
    marginTop: 4,
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
  },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: fonts.body,
    fontSize: typography.labelMd.fontSize,
    lineHeight: typography.labelMd.lineHeight,
    paddingHorizontal: 24,
  },
  transcript: {
    marginTop: spacing.stackMd,
    textAlign: 'center',
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: 22,
    paddingHorizontal: 12,
  },
});
