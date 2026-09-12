import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { AuthSession, User } from '@/src/types';
import { createId, validateEmail, validatePassword } from '@/src/utils/format';

const USERS_KEY = '@thinktap/users';
const SESSION_KEY = '@thinktap/session';
const GUEST_EMAIL = 'guest@thinktap.local';

type StoredUser = User & { password: string };

type AuthState = {
  session: AuthSession | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  ensureGuestSession: () => Promise<AuthSession>;
  signUp: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<{ ok: true } | { ok: false; error: string; field?: string }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
};

async function loadUsers(): Promise<StoredUser[]> {
  const raw = await AsyncStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredUser[];
  } catch {
    return [];
  }
}

async function saveUsers(users: StoredUser[]) {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function createGuestSession(): Promise<AuthSession> {
  const user: User = {
    id: 'guest-local',
    firstName: 'Think',
    lastName: 'Tap',
    email: GUEST_EMAIL,
    createdAt: new Date().toISOString(),
  };
  const session: AuthSession = { user, token: 'guest-token' };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  hydrated: false,

  ensureGuestSession: async () => {
    const existing = get().session;
    if (existing) return existing;
    const session = await createGuestSession();
    set({ session });
    return session;
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) {
        set({ session: JSON.parse(raw) as AuthSession, hydrated: true });
        return;
      }
    } catch {
      // ignore
    }
    // No login for now — open straight into a local guest session.
    const session = await createGuestSession();
    set({ session, hydrated: true });
  },

  signUp: async ({ firstName, lastName, email, password, confirmPassword }) => {
    const emailError = validateEmail(email);
    if (emailError) return { ok: false, error: emailError, field: 'email' };
    if (!firstName.trim()) return { ok: false, error: 'First name is required', field: 'firstName' };
    if (!lastName.trim()) return { ok: false, error: 'Last name is required', field: 'lastName' };
    const passwordError = validatePassword(password);
    if (passwordError) return { ok: false, error: passwordError, field: 'password' };
    if (password !== confirmPassword) {
      return { ok: false, error: 'Passwords do not match', field: 'confirmPassword' };
    }

    const users = await loadUsers();
    const normalized = email.trim().toLowerCase();
    if (users.some((u) => u.email === normalized)) {
      return { ok: false, error: 'An account with this email already exists', field: 'email' };
    }

    const user: StoredUser = {
      id: createId(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalized,
      password,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await saveUsers(users);

    const { password: _, ...safeUser } = user;
    const session: AuthSession = { user: safeUser, token: createId() };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    set({ session });
    return { ok: true };
  },

  signIn: async (email, password) => {
    const emailError = validateEmail(email);
    if (emailError) return { ok: false, error: emailError };

    const users = await loadUsers();
    const normalized = email.trim().toLowerCase();
    const found = users.find((u) => u.email === normalized && u.password === password);
    if (!found) return { ok: false, error: 'Invalid email or password' };

    const { password: _, ...safeUser } = found;
    const session: AuthSession = { user: safeUser, token: createId() };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    set({ session });
    return { ok: true };
  },

  signOut: async () => {
    // Stay in guest mode instead of forcing login.
    const session = await createGuestSession();
    set({ session });
  },
}));
