/**
 * Stops the same screen being pushed onto the navigation stack more than
 * once when a card is tapped several times in quick succession.
 *
 * WHY this is needed: `router.push()` does not de-duplicate. Two taps on the
 * same idea card before the first navigation finishes push the detail screen
 * twice, so the user has to press back twice to get out - it looks like the
 * app "opened it multiple times".
 *
 * WHY a module-level lock rather than per-item state: the bug is about time
 * between taps, not which item was tapped - a lock scoped to one row would
 * not stop a fast tap on a *different* row while the first navigation is
 * still in flight. A single shared lock with a short window is enough to
 * absorb accidental double-taps without making the UI feel unresponsive.
 */
let lastNavigationAt = 0;

/** Minimum time between navigations. Long enough to absorb a double-tap,
 * short enough that it is never noticeable in normal use. */
const NAVIGATION_LOCK_MS = 600;

/**
 * Runs `navigate` at most once per lock window. Call this from a card's
 * `onPress` instead of calling `router.push` directly.
 */
export function guardedNavigate(navigate: () => void): void {
  const now = Date.now();
  if (now - lastNavigationAt < NAVIGATION_LOCK_MS) return;
  lastNavigationAt = now;
  navigate();
}
