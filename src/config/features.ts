/**
 * Build-time feature flags.
 *
 * WHY a flag rather than two versions of the code: maintaining a separate
 * "client build" means every future fix has to be applied twice, and the two
 * copies eventually drift. One codebase, one switch.
 */

/**
 * Shows Settings → Diagnostics, which lets a tester share recent warnings and
 * device state as plain text.
 *
 * ON for internal test builds — it is the only way to get device detail from a
 * phone the developer does not have.
 *
 * OFF for client and production builds — it is an internal tool and would only
 * be confusing.
 *
 * Set `EXPO_PUBLIC_SHOW_DIAGNOSTICS=true` in `.env`, or in the eas.json build
 * profile, to turn it on. Absent means off, so a release build is safe by
 * default — forgetting the flag hides the tool rather than exposing it.
 */
export const SHOW_DIAGNOSTICS =
  process.env.EXPO_PUBLIC_SHOW_DIAGNOSTICS === 'true';
