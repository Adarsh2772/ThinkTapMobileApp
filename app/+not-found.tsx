import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/src/theme/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen does not exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.stackLg,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: 20,
    color: colors.primary,
  },
  link: { marginTop: 16, paddingVertical: 12 },
  linkText: {
    fontFamily: fonts.bodySemi,
    color: colors.secondary,
  },
});
