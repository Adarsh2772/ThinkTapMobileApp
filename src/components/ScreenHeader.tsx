import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDrawerOptional } from '@/src/navigation/DrawerContext';
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';

type Props = {
  title?: string;
  subtitle?: string;
  showMenu?: boolean;
  right?: ReactNode;
};

export function ScreenHeader({ title = 'Think Tap', subtitle, showMenu = true, right }: Props) {
  const drawer = useDrawerOptional();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {showMenu && drawer ? (
          <Pressable
            onPress={drawer.openDrawer}
            style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Ionicons name="menu" size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={styles.menuSpacer} />
        )}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ?? <View style={styles.menuSpacer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.stackSm,
    paddingBottom: spacing.stackMd,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSpacer: { width: 42, height: 42 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  titleBlock: { flex: 1 },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fonts.label,
    fontSize: typography.labelSm.fontSize,
    color: colors.onSurfaceVariant,
  },
});
