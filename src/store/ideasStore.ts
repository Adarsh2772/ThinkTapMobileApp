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
  /** Record a view without changing updatedAt (capture time must stay intact). */
  touchIdea: (id: string) => Promise<void>;
  getIdea: (id: string) => Idea | undefined;
  ideasForUser: (userId: string) => Idea[];
};

async function persist(ideas: Idea[]) {
  await AsyncStorage.setItem(IDEAS_KEY, JSON.stringify(ideas));
}

/**
 * Memory updates immediately. Disk writes are serialized and always persist
 * the latest list — never a stale snapshot that could drop a later take.
 */
let persistChain: Promise<void> = Promise.resolve();

export const useIdeasStore = create<IdeasState>((set, get) => {
  const enqueuePersist = (): Promise<void> => {
    const run = persistChain.then(async () => {
      await persist(get().ideas);
    });
    persistChain = run.catch((err) => {
      console.warn('ideas persist failed', err);
    });
    return run;
  };

  return {
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
            analysis: idea.analysis ?? null,
            lastAccessedAt: idea.lastAccessedAt ?? null,
          }));
          set({ ideas: normalized, hydrated: true });
          return;
        }
      } catch {
        // ignore
      }
      set({ ideas: [], hydrated: true });
    },

    addIdea: (idea) => {
      const ideas = get().ideas;
      if (ideas.some((item) => item.id === idea.id)) return enqueuePersist();
      set({ ideas: [idea, ...ideas] });
      return enqueuePersist();
    },

    updateIdea: (id, patch) => {
      set({
        ideas: get().ideas.map((item) =>
          item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
        ),
      });
      return enqueuePersist();
    },

    deleteIdea: (id) => {
      set({ ideas: get().ideas.filter((item) => item.id !== id) });
      return enqueuePersist();
    },

    touchIdea: async (id) => {
      const now = new Date().toISOString();
      set({
        ideas: get().ideas.map((item) =>
          item.id === id ? { ...item, lastAccessedAt: now } : item,
        ),
      });
      return enqueuePersist();
    },

    getIdea: (id) => get().ideas.find((idea) => idea.id === id),

    ideasForUser: (userId) =>
      get()
        .ideas.filter((idea) => idea.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
});
