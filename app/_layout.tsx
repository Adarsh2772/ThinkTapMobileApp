import {
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { WakeWordProvider } from '@/src/features/wakeWord/WakeWordProvider';
import { useAuthStore } from '@/src/store/authStore';
import { useAiConfigStore } from '@/src/store/aiConfigStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { useWakeWordStore } from '@/src/store/wakeWordStore';
import { colors } from '@/src/theme/tokens';


export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });

  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateIdeas = useIdeasStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateAi = useAiConfigStore((s) => s.hydrate);
  const hydrateWake = useWakeWordStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const aiHydrated = useAiConfigStore((s) => s.hydrated);
  const wakeHydrated = useWakeWordStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    void hydrateAuth();
    void hydrateIdeas();
    void hydrateSettings();
    void hydrateAi();
    void hydrateWake();
  }, [hydrateAuth, hydrateIdeas, hydrateSettings, hydrateAi, hydrateWake]);

  useEffect(() => {
    if (loaded && hydrated && settingsHydrated && aiHydrated && wakeHydrated) {
      SplashScreen.hideAsync();
    }
  }, [loaded, hydrated, settingsHydrated, aiHydrated, wakeHydrated]);

  useEffect(() => {
    if (!loaded || !hydrated || !settingsHydrated || !aiHydrated || !wakeHydrated) return;
    const inAuth = segments[0] === '(auth)';

    if (!session && !inAuth) {
      router.replace('/(auth)/login');
    } else if (session && inAuth) {
      router.replace('/(tabs)');
    }
  }, [session, segments, loaded, hydrated, settingsHydrated, aiHydrated, wakeHydrated, router]);

  if (!loaded || !hydrated || !settingsHydrated || !aiHydrated || !wakeHydrated) {
    return null;
  }

  const tree = (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="processing" options={{ gestureEnabled: false }} />
        <Stack.Screen name="idea/[id]" options={{ headerShown: false }} />
      </Stack>
    </>
  );

  // Only listen for "Hey Think Tap" when signed in.
  return session ? <WakeWordProvider>{tree}</WakeWordProvider> : tree;
}
