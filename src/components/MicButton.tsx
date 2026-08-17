import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing, typography } from '@/src/theme/tokens';
import { formatClock } from '@/src/utils/format';

type Props = {
  isRecording: boolean;
  isPaused?: boolean;
  durationSec: number;
  onPress: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onLongPress?: () => void;
  labelIdle?: string;
  labelRecording?: string;
  labelPaused?: string;
  helperIdle?: string;
};

export function MicButton({
  isRecording,
  isPaused = false,
  durationSec,
  onPress,
  onPause,
  onResume,
  onLongPress,
  labelIdle = 'Tap to Record',
  labelRecording = 'Recording…',
  labelPaused = 'Paused',
  helperIdle = 'On-device speech-to-text — set your transcription language in Settings',
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isRecording || isPaused) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, isRecording, isPaused]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.22] });

  const label = !isRecording ? labelIdle : isPaused ? labelPaused : labelRecording;
  const mainIcon = !isRecording ? 'mic' : 'stop';
  const mainA11y = !isRecording ? 'Start recording' : 'Stop recording';

  return (
    <View style={styles.wrap}>
      <View style={styles.relative}>
        {!isPaused ? (
          <>
            <Animated.View
              style={[styles.ring, styles.ringLg, { transform: [{ scale }], opacity }]}
            />
            <Animated.View
              style={[
                styles.ring,
                styles.ringMd,
                {
                  transform: [{ scale }],
                  opacity: opacity.interpolate({
                    inputRange: [0.1, 0.22],
                    outputRange: [0.05, 0.12],
                  }),
                },
              ]}
            />
          </>
        ) : (
          <View style={[styles.ring, styles.ringLg, styles.pausedRing]} />
        )}
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={500}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            isRecording && styles.recording,
            isPaused && styles.pausedMain,
          ]}
          accessibilityRole="button"
          accessibilityLabel={mainA11y}
        >
          <Ionicons name={mainIcon} size={40} color={colors.onPrimary} />
        </Pressable>
      </View>

      <Text style={styles.label}>{label}</Text>
      {isRecording || helperIdle ? (
        <Text style={styles.helper}>
          {isRecording ? formatClock(durationSec) : helperIdle}
        </Text>
      ) : null}

      {isRecording ? (
        <View style={styles.controls}>
          {isPaused ? (
            <Pressable
              onPress={onResume}
              style={({ pressed }) => [styles.sideBtn, styles.resumeBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Resume recording"
            >
              <Ionicons name="play" size={22} color={colors.onPrimary} />
              <Text style={styles.sideBtnText}>Resume</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onPause}
              style={({ pressed }) => [styles.sideBtn, styles.pauseBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Pause recording"
            >
              <Ionicons name="pause" size={22} color={colors.primary} />
              <Text style={[styles.sideBtnText, styles.pauseBtnText]}>Pause</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.sideBtn, styles.stopBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
          >
            <Ionicons name="stop" size={20} color={colors.onPrimary} />
            <Text style={styles.sideBtnText}>Stop</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.stackLg },
  relative: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.secondary,
  },
  ringLg: { width: 160, height: 160 },
  ringMd: { width: 128, height: 128 },
  pausedRing: {
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: colors.outlineVariant,
  },
  button: {
    width: 112,
    height: 112,
    borderRadius: 999,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.secondary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  recording: { backgroundColor: colors.accent, shadowColor: colors.accent },
  pausedMain: { backgroundColor: colors.onSurfaceVariant, shadowColor: colors.shadow },
  pressed: { transform: [{ scale: 0.9 }] },
  label: {
    marginTop: spacing.stackLg,
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
  },
  helper: {
    marginTop: 8,
    fontFamily: fonts.label,
    fontSize: typography.labelMd.fontSize,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: spacing.stackMd,
  },
  sideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    minWidth: 120,
    justifyContent: 'center',
  },
  pauseBtn: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resumeBtn: {
    backgroundColor: colors.secondary,
  },
  stopBtn: {
    backgroundColor: colors.accent,
  },
  sideBtnText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.onPrimary,
  },
  pauseBtnText: {
    color: colors.primary,
  },
});
