import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { AppLanguageCode } from '@/src/i18n/languages';
import { validateEmail } from '@/src/utils/format';

const SUBSCRIPTION_KEY = '@thinktap/subscription';

export type ProfessionType = 'businessman' | 'working_professional';

export type SubscriptionProfile = {
  name: string;
  email: string;
  contact: string;
  profession: ProfessionType;
  language: AppLanguageCode;
  plan: 'free_trial';
  startedAt: string;
};

type SubscriptionState = {
  profile: SubscriptionProfile | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  startFreeTrial: (input: {
    name: string;
    email: string;
    contact: string;
    profession: ProfessionType;
    language: AppLanguageCode;
  }) => Promise<{ ok: true } | { ok: false; error: string; field?: string }>;
};

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  profile: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
      if (raw) {
        set({ profile: JSON.parse(raw) as SubscriptionProfile, hydrated: true });
        return;
      }
    } catch {
      // ignore
    }
    set({ hydrated: true });
  },

  startFreeTrial: async ({ name, email, contact, profession, language }) => {
    if (!name.trim()) return { ok: false, error: 'Name is required', field: 'name' };
    const emailError = validateEmail(email);
    if (emailError) return { ok: false, error: emailError, field: 'email' };
    if (!contact.trim()) return { ok: false, error: 'Contact is required', field: 'contact' };
    if (!profession) return { ok: false, error: 'Please select your profession', field: 'profession' };

    const profile: SubscriptionProfile = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      contact: contact.trim(),
      profession,
      language,
      plan: 'free_trial',
      startedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(profile));
    set({ profile });
    return { ok: true };
  },
}));
