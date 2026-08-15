import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { AppDrawer } from '@/src/navigation/AppDrawer';
import { useDrawer } from '@/src/navigation/DrawerContext';
import { colors } from '@/src/theme/tokens';

type Props = {
  children: ReactNode;
};

/**
 * Wraps the app stack so opening the drawer slides/scales the current page
 * (classic drawer reveal). Available on every route, not only tabs.
 */
export function DrawerLayout({ children }: Props) {
  const { open, openDrawer, progress, drawerWidth } = useDrawer();

  const edgeOpen = Gesture.Pan()
    .activeOffsetX(16)
    .failOffsetY([-28, 28])
    .onEnd((e) => {
      if (open) return;
      if (e.translationX > 48 || e.velocityX > 450) {
        runOnJS(openDrawer)();
      }
    });

  const contentStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        {
          translateX: interpolate(p, [0, 1], [0, drawerWidth * 0.62], Extrapolation.CLAMP),
        },
        {
          scale: interpolate(p, [0, 1], [1, 0.9], Extrapolation.CLAMP),
        },
      ],
      borderRadius: interpolate(p, [0, 1], [0, 24], Extrapolation.CLAMP),
      overflow: 'hidden' as const,
    };
  });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.content, contentStyle]}>{children}</Animated.View>

      <GestureDetector gesture={edgeOpen}>
        <View style={styles.edgeHit} pointerEvents={open ? 'none' : 'auto'} />
      </GestureDetector>

      <AppDrawer />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.drawerBg,
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
    // Soft shadow when page is peeked beside the drawer
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: -6, height: 0 },
    elevation: 8,
  },
  edgeHit: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 30,
  },
});
