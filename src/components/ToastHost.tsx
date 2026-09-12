import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/src/store/toastStore';
import { colors, fonts, radii, spacing } from '@/src/theme/tokens';

export function ToastHost() {
  const visible = useToastStore((s) => s.visible);
  const message = useToastStore((s) => s.message);
  const tone = useToastStore((s) => s.tone);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!message) return null;

  const bg =
    tone === 'error' ? colors.error : tone === 'info' ? colors.primary : '#16A34A';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          top: insets.top + 12,
          opacity,
          backgroundColor: bg,
          transform: [
            {
              translateY: opacity.interpolate({
                inputRange: [0, 1],
                outputRange: [-8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    left: spacing.containerMargin,
    right: spacing.containerMargin,
    zIndex: 1000,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    color: '#ffffff',
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    textAlign: 'center',
  },
});
