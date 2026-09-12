import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPRING, useDrawer } from '@/src/navigation/DrawerContext';
import { useAuthStore } from '@/src/store/authStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { colors, fonts, radii, spacing, typography } from '@/src/theme/tokens';

type NavItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  href: string;
  match: (path: string) => boolean;
};

export function AppDrawer() {
  const { open, closeDrawer, progress, drawerWidth, navigateFromDrawer } = useDrawer();
  const insets = useSafeAreaInsets();
  const dragX = useSharedValue(0);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.session?.user);
  const tx = useSettingsStore((s) => s.tx);
  const subscription = useSubscriptionStore((s) => s.profile);

  const items: NavItem[] = [
    {
      key: 'home',
      label: tx('home'),
      icon: 'home-outline',
      iconActive: 'home',
      href: '/(tabs)',
      match: (p) =>
        p === '/' ||
        p === '/(tabs)' ||
        p.endsWith('/(tabs)/') ||
        p.includes('/(tabs)/index') ||
        (!p.includes('ideas') &&
          !p.includes('search') &&
          !p.includes('settings') &&
          !p.includes('idea') &&
          !p.includes('processing')),
    },
    {
      key: 'ideas',
      label: tx('ideas'),
      icon: 'bulb-outline',
      iconActive: 'bulb',
      href: '/(tabs)/ideas',
      match: (p) => p.includes('ideas'),
    },
    {
      key: 'search',
      label: tx('search'),
      icon: 'search-outline',
      iconActive: 'search',
      href: '/(tabs)/search',
      match: (p) => p.includes('search'),
    },
    {
      key: 'settings',
      label: tx('settings'),
      icon: 'settings-outline',
      iconActive: 'settings',
      href: '/(tabs)/settings',
      match: (p) => p.includes('settings'),
    },
  ];

  const onClose = () => closeDrawer();

  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .onUpdate((e) => {
      if (!open) return;
      dragX.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      if (!open) return;
      const shouldClose = e.translationX < -drawerWidth * 0.28 || e.velocityX < -600;
      if (shouldClose) {
        const current = progress.value + dragX.value / drawerWidth;
        dragX.value = 0;
        progress.value = current;
        progress.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }, (ok) => {
          if (ok) runOnJS(onClose)();
        });
      } else {
        dragX.value = withSpring(0, SPRING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => {
    const p = progress.value + dragX.value / drawerWidth;
    return {
      opacity: interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  const panelStyle = useAnimatedStyle(() => {
    const p = progress.value + dragX.value / drawerWidth;
    const clamped = interpolate(p, [0, 1], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateX: interpolate(clamped, [0, 1], [-drawerWidth, 0]) }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.backdrop, backdropStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            styles.panel,
            {
              width: drawerWidth,
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 16),
            },
            panelStyle,
          ]}
        >
          <View style={styles.brandBlock}>
            <View style={styles.logoMark}>
              <Ionicons name="mic" size={22} color={colors.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>Think Tap</Text>
              <Text style={styles.brandSub}>Capture ideas by voice</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.drawerMuted} />
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.firstName?.[0] ?? 'T').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.firstName} {user?.lastName}
              </Text>
              <Text style={styles.profileMeta}>
                {subscription ? tx('freeTrialActive') : 'Guest mode'}
              </Text>
            </View>
          </View>

          <View style={styles.nav}>
            {items.map((item) => {
              const active = item.match(pathname);
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    if (active) {
                      onClose();
                      return;
                    }
                    navigateFromDrawer(item.href);
                  }}
                  style={[styles.navItem, active && styles.navItemActive]}
                >
                  <Ionicons
                    name={active ? item.iconActive : item.icon}
                    size={22}
                    color={active ? colors.drawerActive : colors.drawerMuted}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                  {active ? <View style={styles.activeDot} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={() => navigateFromDrawer('/(tabs)/settings')}
              style={styles.subscribeCta}
            >
              <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
              <Text style={styles.subscribeText}>{tx('subscribe')}</Text>
            </Pressable>
            <Text style={styles.version}>Think Tap · 1.0.0</Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.drawerBg,
    paddingHorizontal: spacing.containerMargin,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 16,
    zIndex: 40,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.stackLg,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.drawerActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.drawerText,
  },
  brandSub: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.drawerMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.stackLg,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bodySemi,
    color: colors.onPrimary,
    fontSize: 16,
  },
  profileName: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.bodyMd.fontSize,
    color: colors.drawerText,
  },
  profileMeta: {
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.drawerMuted,
    marginTop: 2,
  },
  nav: { gap: 6, flex: 1 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
  },
  navItemActive: {
    backgroundColor: colors.drawerActiveBg,
  },
  navLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: typography.bodyMd.fontSize,
    color: colors.drawerMuted,
  },
  navLabelActive: {
    color: colors.drawerText,
    fontFamily: fonts.bodySemi,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.drawerActive,
  },
  footer: { gap: 14 },
  subscribeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
  },
  subscribeText: {
    fontFamily: fonts.bodySemi,
    fontSize: typography.labelMd.fontSize,
    color: colors.onPrimary,
  },
  version: {
    textAlign: 'center',
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.drawerMuted,
  },
});
