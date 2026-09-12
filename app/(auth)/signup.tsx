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

export default function SignUpScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    const result = await signUp({ firstName, lastName, email, password, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      if (result.field) setFieldErrors({ [result.field]: result.error });
      else setError(result.error);
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
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Start building your idea archive.</Text>

          <View style={styles.form}>
            <TextField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              error={fieldErrors.firstName}
            />
            <TextField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              error={fieldErrors.lastName}
            />
            <TextField
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={fieldErrors.email}
            />
            <TextField
              label="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={fieldErrors.password}
              placeholder="8+ chars, uppercase, number"
            />
            <TextField
              label="Confirm password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={fieldErrors.confirmPassword}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title={loading ? 'Creating…' : 'Create account'}
              onPress={onSubmit}
              disabled={loading}
            />
          </View>

          <Text style={styles.footer}>
            Already have an account?{' '}
            <Link href="/(auth)/login" style={styles.link}>
              Sign in
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.containerMargin, paddingTop: spacing.sectionGap, paddingBottom: 40 },
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
