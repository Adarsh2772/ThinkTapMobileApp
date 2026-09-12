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

const BAR_COUNT = 7;
const HEIGHTS = [18, 28, 40, 52, 40, 28, 18];

function WaveBar({ index, active }: { index: number; active: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      progress.value = withTiming(0.2, { duration: 200 });
      return;
    }
    progress.value = withDelay(
      index * 90,
      withRepeat(
        withTiming(1, { duration: 420 + index * 40, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [active, index, progress]);

  const style = useAnimatedStyle(() => {
    const h = interpolate(progress.value, [0, 1], [8, HEIGHTS[index] ?? 24]);
    return {
      height: h,
      opacity: active ? 1 : 0.35,
    };
  });

  return <Animated.View style={[styles.bar, style]} />;
}

/**
 * Stylized equalizer bars — visual feedback only, not live audio metering.
 */
export function VoiceWaveform({ active }: { active: boolean }) {
  return (
    <View style={styles.row} accessibilityElementsHidden>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <WaveBar key={i} index={i} active={active} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 56,
    gap: 6,
    marginTop: 8,
  },
  bar: {
    width: 6,
    borderRadius: 99,
    backgroundColor: colors.secondary,
  },
});
