import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IdeaCard } from '@/src/components/IdeaCard';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { guardedNavigate } from '@/src/utils/guardedNavigate';
import { useAuthStore } from '@/src/store/authStore';
import { useIdeasStore } from '@/src/store/ideasStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { readQueueStatuses, type QueueStatus } from '@/src/services/transcriptionQueue';
import type { Idea } from '@/src/types';
import {
    categoryColor,
    colors,
    fonts,
    normalizeCategory,
    radii,
    spacing,
    typography,
} from '@/src/theme/tokens';

export default function IdeasScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.session?.user);
  const allIdeas = useIdeasStore((s) => s.ideas);
  const deleteIdea = useIdeasStore((s) => s.deleteIdea);
  const languageCode = useSettingsStore((s) => s.languageCode);
  const tx = useSettingsStore((s) => s.tx);
  void languageCode;
  const [category, setCategory] = useState<string>('');
  const [queueStatuses, setQueueStatuses] = useState<Map<string, QueueStatus>>(new Map());

  /**
   * WHY this exists: a card showing "Preparing your Thought…" with a spinner
   * used to mean exactly that whether the app was mid-attempt or had been
   * sitting offline for ten minutes - both looked identical, like something
   * was actively happening the whole time. Reading the real queue status
   * lets each card show "waiting for a connection" honestly instead, and
   * only spin while a retry is genuinely in flight. See queueForTranscription
   * for where offline takes actually land, and startAutoRetry (started from
   * the Home screen) for what actually drives a retry once you're back
   * online - this effect only reads that state to reflect it, it does not
   * drive the retries itself.
   */
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const statuses = await readQueueStatuses();
      if (!cancelled) setQueueStatuses(statuses);
    };
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    // 8s: matches the idea detail screen's own poll interval.
    const id = setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(id);
    };
  }, []);

  const myIdeas = useMemo(() => {
    if (!user) return [];
    return allIdeas
      .filter((idea) => idea.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [user, allIdeas]);

  const PENDING = '__pending__';
  const UNCATEGORIZED = 'Uncategorized';

  /**
   * A thought's category is not real data until the same enrichment
   * pipeline that fills in the Thought text also fills in the AI-assigned
   * category - they resolve at the exact same moment, in the same
   * updateIdea() call. Before that, idea.category is just
   * emptySpeechEnrichment()'s hardcoded placeholder ("Business") - not a
   * real guess, just whatever the fallback happens to be. Showing that
   * placeholder as if it were the answer is exactly the bug reported:
   * landing on a "Business" tab for a thought that was never actually
   * about business, just not categorized yet.
   *
   * This reuses the exact same awaiting-check idea/[id].tsx and
   * IdeaCard.tsx already use for the Thought text, since it is the same
   * underlying signal - not a new concept, just applied to category too.
   *
   * A thought whose retries are genuinely exhausted (queueState 'failed')
   * is treated differently again - not "pending" (nothing more will
   * happen on its own) and not the placeholder category either (that was
   * never real). It gets its own honest "Uncategorized" grouping rather
   * than either claiming a wrong category or showing Loading forever for
   * something that has already, permanently, finished trying.
   */
  const categoryStateFor = (idea: Idea): string => {
    const hasThought = Boolean((idea.transcript ?? '').trim());
    const createdMs = new Date(idea.createdAt).getTime();
    const updatedMs = new Date(idea.updatedAt ?? idea.createdAt).getTime();
    const awaiting = !hasThought && updatedMs <= createdMs + 500;
    if (!awaiting) return normalizeCategory(idea.category);
    const qStatus = queueStatuses.get(idea.id);
    if (qStatus?.state === 'failed') return UNCATEGORIZED;
    return PENDING;
  };

  /**
   * Which category tabs exist, and in what order - per the client's spec:
   * no fixed set of 7 tabs. A tab exists only while at least one thought
   * currently belongs there (including the Loading and Uncategorized
   * pseudo-groups above), ordered by which group was most recently
   * touched - record a movie thought and only Movies shows; sing a song
   * next and Songs jumps in front; another movie thought and Movies leads
   * again. A thought that is still being categorized ranks by its own
   * createdAt like any other, so a just-finished recording that has not
   * resolved yet still correctly outranks older, already-known categories
   * - it is "most recent", it just does not have a name yet.
   *
   * WHY this needs no special-case deletion or resolution handling:
   * nothing here is cached - every render where allIdeas or queueStatuses
   * actually changed recomputes which groups currently have a thought at
   * all. A pending thought resolving into a real category, or its retries
   * being exhausted into Uncategorized, is not a special transition this
   * code detects and reacts to - it is just a different answer the next
   * time categoryStateFor is asked, which queueStatuses' own 8-second
   * poll (above) already triggers a re-render for.
   */
  const activeCategories = useMemo(() => {
    const lastTouched = new Map<string, string>();
    for (const idea of myIdeas) {
      const cat = categoryStateFor(idea);
      const existing = lastTouched.get(cat);
      if (!existing || idea.createdAt > existing) {
        lastTouched.set(cat, idea.createdAt);
      }
    }
    return Array.from(lastTouched.entries())
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([cat]) => cat);
  }, [myIdeas, queueStatuses]);

  /** Whichever group the single newest thought currently belongs to. */
  const newestGroup = myIdeas.length > 0 ? categoryStateFor(myIdeas[0]) : '';

  /**
   * WHY tracked by the newest thought's id, not just its group: "always
   * land on the newest" (the client's explicit correction) needs to fire
   * exactly twice per recording - once when it is first saved (jumps to
   * Loading), and once when it resolves (jumps again, from Loading to its
   * real category) - but must NOT keep re-firing on every unrelated
   * re-render, or it would fight a manual tap on an older tab the moment
   * anything else in the app updates. Comparing (id, group) as a pair
   * catches exactly those two real transitions and nothing else: the id
   * changes when a new recording becomes the newest thing; the group
   * changes when that same newest thing resolves.
   */
  /**
   * WHY 'All' only appears with 2+ groups: with a single category present,
   * "All" and that one category would show identical content - a second
   * tab with nothing new to offer. Never the default selection - see the
   * effect below, which always targets a specific group, never 'All' on
   * its own. Tapping it is the only way to select it.
   *
   * WHY declared before the effect below, not after: the effect needs to
   * check the current selection against the tabs actually on screen,
   * including 'All' - checking against activeCategories alone (which
   * never contains the literal string 'All', only the real groups it is
   * built from) meant tapping All was immediately, silently reverted on
   * the very next render, since the effect saw 'All' as a selection that
   * did not match any known group and "corrected" it back to the newest
   * one - the exact bug reported.
   */
  const visibleTabs = activeCategories.length >= 2 ? ['All', ...activeCategories] : activeCategories;

  /**
   * WHY a new recording always force-navigates but a resolution does not:
   * confirmed correct behaviour is "land on Loading the moment you record
   * something" - that always wins, even over wherever you currently are,
   * because it is a direct result of something you just did. Once you
   * have then deliberately moved to a different tab to check something
   * else, that Loading thought finishing categorizing in the background
   * is not something you did - forcing you back to it would yank you
   * away from what you intentionally went to look at. So a resolution
   * only follows through if you are still sitting on the exact tab it
   * auto-landed you on in the first place; the moment you tap anywhere
   * else, the resolution updates the tab list (it still appears/moves in
   * the tab row) but stops trying to pull your selection along with it.
   */
  const followedRef = useRef<{ id: string; group: string } | null>(null);
  useEffect(() => {
    if (myIdeas.length === 0) {
      followedRef.current = null;
      if (category !== '') setCategory('');
      return;
    }
    const newestId = myIdeas[0].id;
    const prev = followedRef.current;

    if (!prev || prev.id !== newestId) {
      // A genuinely new recording became the newest thing - always jump
      // to follow it, regardless of where you currently are.
      followedRef.current = { id: newestId, group: newestGroup };
      setCategory(newestGroup);
      return;
    }

    if (prev.group !== newestGroup) {
      // The same newest thought just resolved. Only follow it onto its
      // new tab if you are still on the tab it was last auto-landed on -
      // otherwise you have moved on to something else yourself, and this
      // should not disturb that.
      const stillWatching = category === prev.group;
      followedRef.current = { id: newestId, group: newestGroup };
      if (stillWatching) setCategory(newestGroup);
      return;
    }

    // Neither a new thought nor a resolution - only correct a selection
    // that has gone stale (its tab disappeared entirely, e.g. every
    // thought in it was deleted), without disturbing a deliberate manual
    // tab choice - including a manual choice of 'All', which is why this
    // checks visibleTabs (what is actually shown right now) rather than
    // activeCategories (which never includes 'All' at all).
    if (!visibleTabs.includes(category)) {
      setCategory(activeCategories[0] ?? '');
    }
  }, [myIdeas, newestGroup, activeCategories, visibleTabs, category]);

  const ideas = useMemo(() => {
    if (!category) return [];
    if (category === 'All') return myIdeas;
    return myIdeas.filter((idea) => categoryStateFor(idea) === category);
  }, [myIdeas, category, queueStatuses]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.pad}>
        <ScreenHeader title="Think Tap" subtitle={tx('myArchive')} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{tx('myArchive')}</Text>
        <Text style={styles.subtitle}>
          {ideas.length} {tx('thoughtsCaptured')}
        </Text>
      </View>

      {visibleTabs.length > 0 ? (
        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {visibleTabs.map((item) => {
              const active = item === category;
              const tint = categoryColor(item);
              const label =
                item === PENDING ? 'Loading' : item === UNCATEGORIZED ? 'Uncategorized' : item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[
                    styles.chip,
                    styles.chipRow,
                    active
                      ? { backgroundColor: tint.bg }
                      : { backgroundColor: tint.soft },
                  ]}
                >
                  {item === PENDING ? (
                    <ActivityIndicator
                      size="small"
                      color={active ? tint.fg : tint.bg}
                      style={styles.chipSpinner}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? tint.fg : tint.bg },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        data={ideas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.stackMd }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {myIdeas.length === 0
              ? 'No Thoughts captured yet.'
              : 'No thoughts in this category yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <IdeaCard
            idea={item}
            variant="archive"
            queueState={queueStatuses.get(item.id)}
            onPress={() => guardedNavigate(() => router.push(`/idea/${item.id}`))}
            onDelete={() => void deleteIdea(item.id)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { paddingHorizontal: spacing.containerMargin },
  titleBlock: {
    paddingHorizontal: spacing.containerMargin,
    marginBottom: spacing.stackMd,
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
  },
  chipsWrap: {
    height: 52,
    marginBottom: spacing.stackMd,
    justifyContent: 'center',
  },
  chips: {
    paddingHorizontal: spacing.containerMargin,
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', gap: 6 },
  chipSpinner: { marginRight: -2 },
  chipText: {
    fontFamily: fonts.label,
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  list: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: 120,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    marginTop: spacing.stackLg,
  },
});
