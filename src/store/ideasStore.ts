import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { Idea } from '@/src/types';

const IDEAS_KEY = '@thinktap/ideas';

type IdeasState = {
  ideas: Idea[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addIdea: (idea: Idea) => Promise<void>;
  updateIdea: (id: string, patch: Partial<Idea>) => Promise<void>;
  deleteIdea: (id: string) => Promise<void>;
  getIdea: (id: string) => Idea | undefined;
  ideasForUser: (userId: string) => Idea[];
};

async function persist(ideas: Idea[]) {
  await AsyncStorage.setItem(IDEAS_KEY, JSON.stringify(ideas));
}

export const useIdeasStore = create<IdeasState>((set, get) => ({
  ideas: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(IDEAS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Idea[];
        const normalized = parsed.map((idea) => ({
          ...idea,
          transcriptSource: idea.transcriptSource ?? 'demo',
        }));
        set({ ideas: normalized, hydrated: true });
        return;
      }
    } catch {
      // ignore
    }
    set({ ideas: [], hydrated: true });
  },

  addIdea: async (idea) => {
    const ideas = [idea, ...get().ideas];
    set({ ideas });
    await persist(ideas);
  },

  updateIdea: async (id, patch) => {
    const ideas = get().ideas.map((item) =>
      item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
    );
    set({ ideas });
    await persist(ideas);
  },

  deleteIdea: async (id) => {
    const ideas = get().ideas.filter((item) => item.id !== id);
    set({ ideas });
    await persist(ideas);
  },

  getIdea: (id) => get().ideas.find((item) => item.id === id),

  ideasForUser: (userId) =>
    get()
      .ideas.filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
}));
