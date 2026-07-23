import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing, typography } from '@/src/theme/tokens';
import { formatClock } from '@/src/utils/format';

type Props = {
  isRecording: boolean;
  durationSec: number;
  onPress: () => void;
  labelIdle?: string;
  labelRecording?: string;
  helperIdle?: string;
};

export function MicButton({
  isRecording,
  durationSec,
  onPress,
  labelIdle = 'Tap to Record',
  labelRecording = 'Recording…',
  helperIdle = 'AI will transcribe and categorize instantly',
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.22] });

  return (
    <View style={styles.wrap}>
      <View style={styles.relative}>
        <Animated.View style={[styles.ring, styles.ringLg, { transform: [{ scale }], opacity }]} />
        <Animated.View
          style={[
            styles.ring,
            styles.ringMd,
            {
              transform: [{ scale }],
              opacity: opacity.interpolate({ inputRange: [0.1, 0.22], outputRange: [0.05, 0.12] }),
            },
          ]}
        />
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, isRecording && styles.recording]}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <Ionicons name={isRecording ? 'stop' : 'mic'} size={40} color={colors.onPrimary} />
        </Pressable>
      </View>
      <Text style={styles.label}>{isRecording ? labelRecording : labelIdle}</Text>
      <Text style={styles.helper}>
        {isRecording ? formatClock(durationSec) : helperIdle}
      </Text>
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
  button: {
    width: 112,
    height: 112,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  recording: { backgroundColor: colors.error },
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
});
