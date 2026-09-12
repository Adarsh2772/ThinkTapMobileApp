import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/src/theme/tokens';

type Props = {
  /** Wake heard or a take is open. */
  active: boolean;
  paused?: boolean;
  /** Subtle idle glow when Hey ThinkTap is armed. */
  idleReady?: boolean;
};

function PulseRing({
  delayMs,
  active,
  paused,
  idleReady,
}: {
  delayMs: number;
  active: boolean;
  paused: boolean;
  idleReady: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (paused || (!active && !idleReady)) {
      progress.value = withTiming(0, { duration: 280 });
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, {
          duration: active ? 1600 : 2800,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false,
      ),
    );
  }, [active, delayMs, idleReady, paused, progress]);

  const style = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.92, active ? 1.85 : 1.28]);
    const opacity = interpolate(progress.value, [0, 0.55, 1], [active ? 0.38 : 0.16, 0.16, 0]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return <Animated.View style={[styles.ring, active ? styles.ringHot : styles.ringIdle, style]} />;
}

/**
 * Google Assistant / Siri-style glowing rings behind the mic.
 * Presentation only — does not own the microphone or STT.
 */
export function VoiceListeningOrb({ active, paused = false, idleReady = false }: Props) {
  const glow = useSharedValue(0);

  useEffect(() => {
    if (paused) {
      glow.value = withTiming(0.2, { duration: 240 });
      return;
    }
    if (!active && !idleReady) {
      glow.value = withTiming(0, { duration: 240 });
      return;
    }
    glow.value = withRepeat(
      withTiming(1, { duration: active ? 900 : 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [active, glow, idleReady, paused]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.18, active ? 0.55 : 0.28]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.96, 1.06]) }],
  }));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <PulseRing delayMs={0} active={active} paused={paused} idleReady={idleReady} />
      <PulseRing delayMs={420} active={active} paused={paused} idleReady={idleReady} />
      <PulseRing delayMs={840} active={active} paused={paused} idleReady={idleReady} />
      <Animated.View style={[styles.glow, glowStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 999,
    borderWidth: 2,
  },
  ringHot: {
    borderColor: colors.secondary,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  ringIdle: {
    borderColor: 'rgba(37, 99, 235, 0.35)',
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
  },
  glow: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 999,
    backgroundColor: colors.secondary,
  },
});
