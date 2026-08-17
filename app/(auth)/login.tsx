import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextField } from '@/src/components/ui';
import { useAuthStore } from '@/src/store/authStore';
import { colors, fonts, spacing, typography } from '@/src/theme/tokens';

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    const result = await signIn(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>Think Tap</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to continue capturing ideas.</Text>

          <View style={styles.form}>
            <TextField
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
            />
            <TextField
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title={loading ? 'Signing in…' : 'Sign in'} onPress={onSubmit} disabled={loading} />
          </View>

          <Text style={styles.footer}>
            New here?{' '}
            <Link href="/(auth)/signup" style={styles.link}>
              Create account
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.containerMargin, paddingTop: spacing.sectionGap },
  brand: {
    fontFamily: fonts.headlineExtra,
    fontSize: typography.titleMd.fontSize,
    color: colors.primary,
    marginBottom: spacing.stackLg,
  },
  title: {
    fontFamily: fonts.headlineBold,
    fontSize: typography.headlineLgMobile.fontSize,
    color: colors.onBackground,
  },
  subtitle: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.stackLg,
  },
  form: { marginTop: spacing.stackMd },
  error: {
    color: colors.error,
    fontFamily: fonts.label,
    marginBottom: spacing.stackMd,
  },
  footer: {
    marginTop: spacing.stackLg,
    textAlign: 'center',
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
  },
  link: { color: colors.secondary, fontFamily: fonts.bodySemi },
});
