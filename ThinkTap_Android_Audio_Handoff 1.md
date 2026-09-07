# ThinkTap — Android Audio & Wake-Word Handoff

**Purpose:** hand this to the developer taking over the Android voice-capture work.
**Scope:** recording cutoff, wake/stop phrases, audio playback, transcript quality, AI analysis, manual mode.

**Governing requirement:** the app must behave the same on every supported Android version. Where the OS genuinely differs, the app must *detect* the difference at runtime and adapt — it must not hardcode version numbers. §3 explains why this distinction matters and how it is implemented.

---

## 0. Environment as tested

| Item | Value |
|---|---|
| Expo SDK | 57 |
| React Native | 0.86 |
| expo-audio | ~57.0.4 |
| expo-speech-recognition | 56.0.1 → **57.0.0** (upgraded during this session) |
| Custom native module | `modules/android-wake-word` (Kotlin, foreground service) |
| targetSdkVersion | 35 (Expo SDK 57 default — full Android 15 restrictions apply) |
| Storage | AsyncStorage + expo-file-system, on-device only |
| Analysis endpoint | `https://thinktapai.shastrarth.in/api/v1/transcripts/analyze` |

**Build note:** Kotlin changes require `npx expo run:android --device`. Pressing `r` in Metro reloads JavaScript only and will silently leave old native code running. This caused several false "the fix didn't work" conclusions during debugging.

---

## 1. Architecture as it actually is

Understanding this is a prerequisite — several early hypotheses were wrong because it wasn't clear.

```
Wake word (Kotlin foreground service, own SpeechRecognizer)
        ↓  onWakeDetected → JS
useIdeaCapture (orchestrator)
        ↓
useLanguageTranscript → ExpoSpeechRecognitionModule   ← live text
        ↓
useRecording → expo-audio                             ← audio file
        ↓
processRecording → Groq/Whisper (optional) → analyze API
        ↓
ideasStore (AsyncStorage)
```

### Which matcher runs when — important

| Situation | Wake/stop matching runs in |
|---|---|
| App backgrounded / idle | **Kotlin** (`WakeWordForegroundService.kt`) |
| App open, capture running | **JavaScript** (`src/features/wakeWord/phrases.ts`) |

The wake service is *paused* during a capture (`pausedForRecording`), so spoken "stop" while recording is matched in JS, not Kotlin. **Both must be fixed and kept in sync.** This asymmetry explained why "stop" worked after a JS reload while "start" did not.

---

## 2. ISSUE — Android 15 records only 2–3 seconds ✅ ROOT CAUSE FOUND

### Symptom
On Android 15, transcription stopped after ~2–3 seconds. On Android 11, full-length capture worked.

### Root cause
`src/services/languageTranscriptService.ts`:

```ts
function canPersistRecognitionAudio(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 33;
}
```

API 35 → `persist: true`, so `recordingOptions` were passed to `ExpoSpeechRecognitionModule.start()`, asking the recognizer to write a WAV while transcribing. API 30 → `persist: false`.

**This was the only version-dependent branch in the audio path.** On API 35 the persist path terminates the recognition session almost immediately.

### Evidence
With persist disabled, the session survived 30.6 seconds with no `end` event:

```
// [STT] start      at 1788722874977  persist: false
// [STT] listening  at 1788722874981
// ...no end event for 30.6 seconds...
// [STT] error aborted  at 1788722905586   ← user-initiated stop
```

### Fix
Do **not** replace one version check with another. Recognizer persist is unreliable across versions and OEMs; it is not needed at all once expo-audio owns the file (§3).

```ts
/**
 * WHY: recognizer audio persistence behaves differently on every Android
 * version — on API 35 it terminates the session after ~2s. The audio file now
 * always comes from expo-audio (see §3), so this path is retired entirely.
 * One behaviour on every device beats three version branches.
 */
function canPersistRecognitionAudio(): boolean {
  return false;
}
```

### Status
Confirmed working on Android 15. Because this returns `false` unconditionally, older versions lose nothing — they already returned `false` below API 33, and §3 gives 13/14 a better file source than persist ever was.

---

## 3. Single code path for all Android versions ⚠️ CORE DESIGN — TEST FIRST

This section replaces what would otherwise have been three separate version-branched fixes. Read it before touching §2 or §4.

### The problem with version numbers

The original code branched on `Platform.Version >= 33`. Patching that to `>= 33 && < 35` would have produced three code paths:

| Version | Path |
|---|---|
| ≤12 (API ≤32) | expo-audio only, no live transcript |
| 13–14 (API 33–34) | recognizer persist |
| 15+ (API 35+) | parallel expo-audio |

Three paths means three things to test, three ways to break, and no coverage for OEMs that don't follow the version rules — Samsung, Xiaomi, Oppo and Vivo all deviate on microphone arbitration. Hardcoded version numbers also break silently when Android 16 ships.

### The approach instead: detect capability at runtime

Try the preferred mode. If the device can't do it, detect the failure and fall back automatically — within the same take, without the user noticing.

**Preferred mode (attempted on every Android version):**
`expo-audio` records the file, recognizer produces live text, both running together.

**Fallback (any device that can't share the mic):**
`expo-audio` owns the mic alone; transcript is produced after Stop from the saved file.

The audio file is written in both modes. That is the property that matters: per the product spec, *"Losing a captured thought is the highest-severity failure."*

### Implementation — `src/hooks/useIdeaCapture.ts`

```ts
const audioOnly = resolveCaptureMode(preferSavedAudio) === 'audio-file';

/**
 * WHY: expo-audio always writes the file, on every Android version. The take
 * must survive Stop even if the recognizer, the network, or the AI layer fails.
 * No Platform.Version check — capability is detected at runtime below.
 */
const fileRecorder = true;
```

### Implementation — capability detection

```ts
/**
 * WHY: some devices (typically Android 12 and below, plus certain OEM builds)
 * cannot run expo-audio and SpeechRecognizer on the mic simultaneously. Rather
 * than guessing from Platform.Version, attempt it and detect the failure.
 *
 * Detection: the recognizer errors with audio-capture / client / busy inside
 * the grace window while the recorder is confirmed running. That combination
 * means mic contention, not a transient glitch.
 */
const PARALLEL_GRACE_MS = 2500;
const micShareFailedRef = useRef(false);
const parallelStartedAtRef = useRef(0);
```

Set the timestamp when the take starts, immediately after `audio.start()` succeeds:

```ts
parallelStartedAtRef.current = Date.now();
```

In the STT error path passed to `useLanguageTranscript`:

```ts
onSttError: (code: string) => {
  const withinGrace = Date.now() - parallelStartedAtRef.current < PARALLEL_GRACE_MS;
  const contention = code === 'audio-capture' || code === 'client' || code === 'busy';
  if (withinGrace && contention && !micShareFailedRef.current) {
    // WHY: this device cannot share the mic. Stop retrying live transcription
    // and let the take continue as audio-only — the file is already recording,
    // so nothing is lost. Transcript comes from the file after Stop.
    micShareFailedRef.current = true;
    console.log('[CAPTURE] mic sharing unsupported — falling back to audio-only');
    stopListening(true);
    return;
  }
  // ...existing handling
},
```

Then gate live transcription on the flag:

```ts
useLanguageTranscript({
  speechLocale,
  enabled: active && !audioOnly && !callHold && !micShareFailedRef.current,
  // ...
});
```

### Persisting the result

Re-detecting on every take wastes the first 2.5 seconds of transcript each time. Cache it:

```ts
// WHY: mic-sharing capability is a property of the device, not the session.
// Store it once so later takes go straight to the correct mode.
const MIC_SHARE_KEY = '@thinktap/mic_share_supported';
```

Read on app start, write the first time detection fires. Clear it on app update, since an OS upgrade can change the answer.

### What the user sees

| Device | Behaviour |
|---|---|
| Mic sharing works | Live transcript + audio file. Full experience. |
| Mic sharing fails | Audio file + transcript appears shortly after Stop. Same thought, same data, brief delay. |

No error, no failed take, no version-specific messaging. The UI should show "Transcribing…" rather than an empty transcript in the fallback case.

### Testing this specifically

This is the highest-risk change in the document and **must** be tested on at least two physical devices spanning the supported range. `useIdeaCapture`'s own header comment warns that parallel capture "steals the mic" — that warning was written against older Android and may or may not still hold.

| Device | Android | Live transcript? | Audio file? | Fell back? |
|---|---|---|---|---|
| | | | | |

If the fallback fires on a device where it shouldn't, widen `PARALLEL_GRACE_MS` before concluding mic sharing is unsupported — a slow OEM recognizer can error late for unrelated reasons.

---

## 4. ISSUE — No audio saved, playback dead ✅ RESOLVED BY §3

### Symptom
The player shows "No audio file was saved for this thought." Play and ±10s buttons do nothing.

### Root cause
Two compounding causes:

1. On Android 13+, `resolveCaptureMode` always returned `device`, so `fileRecorder` was false and `expo-audio` never recorded.
2. In `device` mode the only file source was recognizer persist — which §2 disabled.

Net result: `uri` empty, nothing to play. Not a player bug; the file genuinely did not exist.

### Fix
`fileRecorder = true` from §3 resolves this on every version, because expo-audio now always records. No change needed in `AudioPlayer.tsx` — that component is correct and already handles a missing URI gracefully.

### Verify
Record, stop, open the thought, press play, use ±10s. Confirm the file exists:

```powershell
adb shell run-as com.thinktap.app ls -la files/recordings/
```

---

## 5. ISSUE — Duplicate transcript hook instances ✅ FIXED

### Symptom
Erratic start/stop/resume; words dropped mid-capture. Affects **all Android versions** — it was simply more visible on 15.

### Root cause
Three simultaneous instances of `useLanguageTranscript`, each with independent state, aborting and restarting the shared recognizer underneath each other.

```
// Three different gen values firing "end" in the same millisecond:
// [STT] end  at 1788723153535  gen: 3  nativeGen: 1
// [STT] end  at 1788723153536  gen: 6  nativeGen: 4
// [STT] end  at 1788723153537  gen: 0  nativeGen: 0
```

`useIdeaCapture` is called once in `HomeScreen`, so **HomeScreen itself was mounted three times.** Contributing routes to `/(tabs)`:

- `WakeWordProvider` → `router.replace('/(tabs)')` on every wake, *even when already on Home*
- `app/index.tsx` → `<Redirect href="/(tabs)" />`
- `RootLayout` → `router.replace('/(tabs)')` when leaving auth
- `ProcessingScreen` → `router.replace('/(tabs)')` on success

`useLanguageTranscript`'s cleanup is asynchronous, so an old instance stays alive while the new one starts.

### Fix A — `src/features/wakeWord/WakeWordProvider.tsx`

```ts
import { usePathname, useRouter } from 'expo-router';
```

```ts
function useNavigateHomeOnWake() {
  const router = useRouter();
  const pathname = usePathname();
  const triggerToken = useWakeWordStore((s) => s.triggerToken);
  const lastToken = useRef(0);

  useEffect(() => {
    if (!triggerToken || triggerToken === lastToken.current) return;
    lastToken.current = triggerToken;
    // WHY: replacing the route with itself remounts HomeScreen and leaves a
    // second live transcript hook fighting for the microphone.
    if (pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index') {
      return;
    }
    router.replace('/(tabs)');
  }, [triggerToken, router, pathname]);
}
```

### Fix B — `src/hooks/useLanguageTranscript.ts`

A hard guard, so the symptom cannot recur regardless of which route caused a remount.

Module scope, above `type Options`:

```ts
/**
 * WHY: only one instance may drive the recognizer. Screen remounts can leave an
 * old instance alive whose async cleanup has not finished. Newest mount wins.
 * No version check — this affects every Android version.
 */
let recognizerOwner: symbol | null = null;
```

Inside the hook, after `const genRef = useRef(0);`:

```ts
const ownerRef = useRef<symbol>(Symbol('stt'));
```

At the top of `startListening`:

```ts
// WHY: claim the recognizer so a stale instance cannot restart underneath us.
recognizerOwner = ownerRef.current;
```

As the **first line** of each of the `result`, `end`, and `error` handlers:

```ts
if (recognizerOwner !== ownerRef.current) return;
```

### Status
Applied. Post-fix logs showed a single `gen` value. Re-verify after §3 lands.

---

## 6. ISSUE — "Hey ThinkTap start" doesn't start ⚠️ NEEDS REBUILD

### Symptom
Stop worked; start did not. Affects **all Android versions** — the phrase list was never adequate.

### Root cause
Google's recognizer never returns the brand name cleanly. Actual output observed:

```
// [WAKE] heard: "think that"          → no match, old list
// [WAKE] heard: "thinking tab start"  → no match
// [WAKE] heard: "hitting tap start"   → no match
// [WAKE] heard: "I think that start"  → no match
// [WAKE] heard: "think I have start"  → no match
// [WAKE] heard: "hey think app"       → MATCHED (was in the hardcoded list)
```

A fixed list of literal strings cannot cover this — it needs pattern matching.

Second defect: `matchesWakePhrase` used `.includes()` against a list containing the bare token `"thinktap"`, so **"hey thinktap stop" also matched the wake phrase.** Wake was checked first, so saying stop re-triggered a wake.

Third defect: `'start recording'` appeared in both `WAKE_PHRASES` and `RESUME_COMMANDS`, making start-vs-resume ambiguous.

### Fix A — `modules/android-wake-word/.../WakeWordForegroundService.kt`

Replaces the `WAKE_PHRASES` / `STOP_COMMANDS` / `matchesWakePhrase` / `matchesStopPhrase` block inside the `companion object`:

```kotlin
    /**
     * WHY: Google returns a different mangling every time ("think that",
     * "thinking tab", "hitting tap", "I think that"). Match the shape of the
     * name, not a fixed list of strings. Applies to every Android version —
     * the recognizer mangles the brand name on all of them.
     */
    private val NAME_PATTERN = Regex(
      "\\b(hey|hi|a|i|hitting|thinking)?\\s*" +
        "(think|thin|thing|sink|hitting|thinking)\\s*" +
        "(tap|tab|top|app|cap|that|taps|tabs|i have)\\b"
    )

    private val START_ONLY = Regex("\\b(start|begin|new)\\s+(recording|record|note|idea)\\b")
    private val STOP_ONLY = Regex("\\b(stop|end|finish)\\s+(the\\s+)?(recording|record)\\b")
    private val TRAILING_STOP = Regex("\\b(stop|end|finish|done)\\b\\s*$")

    private val STOP_WORDS = listOf(
      "stop", "please stop", "that is all", "thats all",
      "im done", "i m done", "i am done",
    )

    fun normalize(text: String): String =
      text.lowercase()
        .replace(Regex("[^a-z0-9\\s]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    fun matchesStopPhrase(text: String): Boolean {
      val n = normalize(text)
      if (n.isEmpty()) return false
      if (STOP_ONLY.containsMatchIn(n)) return true
      if (NAME_PATTERN.containsMatchIn(n) && TRAILING_STOP.containsMatchIn(n)) return true
      return STOP_WORDS.any { it == n }
    }

    fun matchesWakePhrase(text: String): Boolean {
      val n = normalize(text)
      if (n.isEmpty()) return false
      // WHY: a stop utterance also contains the name — stop must win.
      if (matchesStopPhrase(n)) return false
      if (START_ONLY.containsMatchIn(n)) return true
      if (NAME_PATTERN.containsMatchIn(n)) return true
      return false
    }
```

**Brace warning:** the `companion object` must still be closed with `}` after `matchesWakePhrase`. Deleting it moves every instance field into the companion object and breaks the build.

### Fix B — `src/features/wakeWord/phrases.ts`

Same collision, JavaScript side. Remove `'start recording'` and `'start record'` from `RESUME_COMMANDS`, then:

```ts
const WAKE_SUFFIX_STOP = /\b(stop|end|finish|pause)\b\s*$/;

function isCommandUtterance(normalized: string): boolean {
  if (STOP_COMMANDS.some((p) => normalized.includes(p))) return true;
  if (PAUSE_COMMANDS.some((p) => normalized.includes(p))) return true;
  if (WAKE_SUFFIX_STOP.test(normalized)) return true;
  return false;
}

export function matchesWakePhrase(text: string): boolean {
  const normalized = normalizeSpeech(text);
  if (!normalized) return false;
  // WHY: "hey thinktap stop" contains "thinktap" — it is a stop, not a wake.
  if (isCommandUtterance(normalized)) return false;
  return WAKE_PHRASES.some(
    (phrase) => normalized === phrase || normalized.includes(phrase),
  );
}

export function matchesStopPhrase(text: string): boolean {
  const normalized = normalizeSpeech(text);
  if (!normalized) return false;
  if (/\bthink\s?(tap|app|tab|that|cap|top)\b/.test(normalized)) {
    if (WAKE_SUFFIX_STOP.test(normalized)) return true;
  }
  return matchesCommand(text, STOP_COMMANDS, STOP_WORDS);
}
```

### Extending the pattern
When a device produces a mangling that doesn't fire, add it to `NAME_PATTERN` — do not add another literal string to a list. Capture candidates from:

```powershell
adb logcat | Select-String -Pattern "WAKE"
```

### Status
Written, requires `npx expo run:android --device`. Not yet verified.

---

## 7. ISSUE — Mixed-language transcripts ❌ NOT FIXED (deferred)

### Symptom
Speaking English then Marathi produces inconsistent output; Marathi appears where it shouldn't or disappears where it should stay.

### Root causes identified

**a) Kotlin `normalize()` strips Devanagari.**
```kotlin
.replace(Regex("[^a-z0-9\\s]"), " ")
```
Every Indic character is deleted before matching, and Kotlin's `STOP_WORDS` has no Indic entries. Marathi "थांबा" can never stop the background service.

Fix when re-enabling multilingual:
```kotlin
// WHY: the a-z0-9 filter deleted every Indic stop word before matching.
.replace(Regex("[^a-z0-9\\u0900-\\u097F\\s]"), " ")
```
and add Indic entries to `STOP_WORDS` plus a trailing-stop regex for Devanagari.

**b) Silent locale fallback.** `handleLanguageUnavailable` steps down `mr-IN → en-IN → en-US` when a locale has no on-device model, without telling the user. This is **device-dependent, not version-dependent** — a phone without the language pack behaves this way on any Android version.

**c) `contextualStrings` bias.** `contextualStringsForLocale` injects Devanagari stop-words even into English sessions, biasing the engine toward Devanagari output.

**d) AI layer must not rewrite.** `enrichPendingRecording` has a guard (`keepAnalysisSummary`) that drops the analysis summary when the transcript has Indic script but the analysis doesn't — correct, preserve it. **The `transcript` field must never be overwritten by AI output.** (Spec §4.)

### Product decision needed
Two mutually exclusive behaviours:
1. Preserve code-switching verbatim (spec §4 implies this: *"verbatim… in the language spoken"*)
2. Normalise everything to one language

Pick one before implementing.

### Note on offline language packs
`triggerOfflineModelDownload` already exists in `languageTranscriptService.ts` but is never called in the capture flow. Prompting the user to install their chosen language pack would remove most of cause (b) and works identically on every Android version.

---

## 8. ISSUE — AI analysis incomplete ✅ DIAGNOSED, SERVER-SIDE

### Symptom
```
// WARN  Transcript analyze failed; using local summary
// [Error: The origin web server returned an invalid or incomplete response to
//  Cloudflare. This typically indicates the origin is overloaded or misconfigured.]
```

### Root cause
The endpoint returns **HTTP 502** to any caller, on any device. Verified independently of the app:

```powershell
Invoke-WebRequest -Uri "https://thinktapai.shastrarth.in/api/v1/transcripts/analyze" `
  -Method POST -ContentType "application/json" -Body '{"transcript":"test"}'
# → 502
```

The client code in `transcriptAnalysisService.ts` is correct — right shape, right headers, proper error handling. **Nothing to fix in the app.** Whoever operates `shastrarth.in` must restart the origin process and check its logs.

### Workaround available
The URL is already overridable:
```
EXPO_PUBLIC_TRANSCRIPT_ANALYZE_URL=https://your-server/api/v1/transcripts/analyze
```
There is also a proxy in `server/` (see `server/README.md`) that may be runnable locally.

### Two client-side gaps worth closing
- **No timeout.** If the server hangs instead of 502-ing, `fetch` waits indefinitely and the take never finishes processing. Add `AbortSignal.timeout(20000)`.
- **No retry.** A transient 502 permanently loses analysis for that thought. Since transcripts are stored, add a "re-run analysis" action on the thought view.

---

## 9. ISSUE — Manual mode (wake toggle off) ❌ NOT VERIFIED

Per the product spec §3, **single-tap start / single-tap stop is the primary shipped mechanism**; wake word is listed as optional. Treat this as higher priority than the wake-phrase work.

The code path exists (`onMicPress` in `app/(tabs)/index.tsx`) and looks correct, but was never tested in isolation because the duplicate-mount problem (§5) made results unreliable.

Manual mode has **no version-dependent code** — it should behave identically everywhere, which makes it the best baseline test for confirming a device is healthy before testing anything else.

**Test after §3 and §5 are confirmed, on every device:**

| # | Action | Expected |
|---|---|---|
| 1 | Wake toggle OFF in Settings | No foreground service notification |
| 2 | Tap mic | Recording starts |
| 3 | Tap Pause | Pauses, timer freezes |
| 4 | Tap Resume | Continues same take |
| 5 | Tap mic again | Stops, thought saved |
| 6 | Long-press while recording | Discard prompt |

---

## 10. Transcript accuracy — what to actually use

### Realistic expectations
No STT system reaches 99–100% on real-world audio. Published word error rates are 4–8% on clean read speech, 10–20% on accented conversational speech or code-switched languages. For Indian-accented English mixed with Marathi, **85–92% is a realistic ceiling.** This is not an app bug.

### Why current accuracy is below that ceiling

| Cause | Version-specific? |
|---|---|
| Android on-device `SpeechRecognizer` is tuned for short commands, not dictation | No — all versions |
| Constant session restarts (`scheduleRestart(150)`) drop words in the gap | No — all versions |
| Duplicate hook instances (§5) abort sessions mid-word | No — all versions |
| `EXPO_PUBLIC_GROQ_API_KEY` is empty, so the cloud path never runs | No — all versions |
| No audio file saved (§4) means nothing to send to cloud STT | Was 13+; fixed by §3 |

**Four of the five are not version-specific.** Fix them before concluding anything about the recognizer's quality on any particular device.

### Recommended architecture — identical on every version

```
Tap Start
   ↓
expo-audio records 16kHz mono   ← never fails, never needs network, every version
   ↓
Live transcript if the device supports mic sharing (§3), otherwise skipped
   ↓
Tap Stop → file saved locally
   ↓
Whisper (Groq or OpenAI) transcribes the file   ← 3–5× better than on-device
   ↓
Transcript saved as the Human Signal
   ↓
Analysis API adds title/summary   ← optional, must never overwrite transcript
```

This matches the product spec: *"Save audio first; attach transcript when ready. Network or AI downtime must not block preservation."*

The only thing that varies by device is whether the live transcript appears during recording. The stored result is identical everywhere.

### Recording settings — already correct
`VOICE_RECORDING` in `useRecording.ts` uses 16kHz mono AAC. That is right for speech; do not "improve" it to stereo or 44.1kHz.

---

## 11. Security — must be addressed before release

**API keys are shipped in the binary.** Anything prefixed `EXPO_PUBLIC_` is bundled into the APK and extractable by anyone who downloads it. The project's own `.env` says so:

> *"Prefer the production proxy (EXPO_PUBLIC_API_URL) so keys never ship in the app binary. Rotate any key that was ever committed under EXPO_PUBLIC_*."*

**Actions:**
1. Rotate any Groq/OpenAI key ever committed under an `EXPO_PUBLIC_*` name. Check with:
   `git log --all -p -- .env | Select-String "sk-|gsk_"`
2. Route all AI calls through the proxy in `server/`, not directly from the app.
3. Never ship a build with a populated `EXPO_PUBLIC_GROQ_API_KEY`.

---

## 12. Debug instrumentation

Temporary logs added during diagnosis. Keep them behind a flag or remove before release, but they are the fastest way to re-diagnose these issues on any device.

### `src/services/languageTranscriptService.ts` — before `ExpoSpeechRecognitionModule.start()`
```ts
console.log('[STT] start', { lang, persist, at: Date.now() });
```

### `src/hooks/useLanguageTranscript.ts`
```ts
// in the 'end' handler
console.log('[STT] end', { at: Date.now(), starting: startingRef.current,
                           gen: genRef.current, nativeGen: nativeGenRef.current });

// in the 'error' handler
console.log('[STT] error', event?.error, { at: Date.now(), starting: startingRef.current });

// after setListening(true) in startListening
console.log('[STT] listening', { at: Date.now(), gen });
```

### `src/hooks/useIdeaCapture.ts` — capability detection (§3)
```ts
console.log('[CAPTURE] mode', { audioOnly, micShareFailed: micShareFailedRef.current,
                                androidVersion: Platform.Version });
```

### `src/hooks/useWakeWordListener.ts` — inside the native listeners
```ts
console.log('[WAKE] heard:', JSON.stringify(event.transcript));      // onPartialResult
console.log('[WAKE] WAKE FIRED:', JSON.stringify(event.transcript)); // onWakeDetected
console.log('[WAKE] STOP FIRED:', JSON.stringify(event.transcript)); // onStopDetected
```

### Optional — detect duplicate mounts in `HomeScreen`
```ts
const mountIdRef = useRef(Math.random().toString(36).slice(2, 7));
useEffect(() => {
  console.log('[HOME] mount', mountIdRef.current);
  return () => console.log('[HOME] unmount', mountIdRef.current);
}, []);
```

### Reading the logs

```powershell
# Windows PowerShell
adb logcat -c
adb logcat | Select-String -Pattern "STT|WAKE|HOME|CAPTURE|AudioRecord|SpeechRecognizer|ForegroundService"
```

```bash
# macOS / Linux
adb logcat -c
adb logcat | grep -iE "STT|WAKE|HOME|CAPTURE|AudioRecord|SpeechRecognizer|ForegroundService"
```

Always record the device details alongside any log you file:
```powershell
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.manufacturer
```

### What to look for

| Pattern | Meaning |
|---|---|
| `[STT] end` ~2–3s after `[STT] listening` | Session cut short — check `persist` is false |
| Multiple different `gen` values in one burst | Duplicate hook instances (§5) |
| `[CAPTURE] mic sharing unsupported` | Fallback fired — expected on some devices, note which |
| `[WAKE] heard:` with no `WAKE FIRED` | Phrase-matching gap — add the mangling to `NAME_PATTERN` |
| `ForegroundServiceStartNotAllowedException` | Android 14+ blocked a background service start |
| `AudioRecord ... obtainBuffer timed out` | Two components fighting for the mic |
| `[STT] error network` | Recognizer fell back to online mode and failed |

---

## 13. Test matrix — run on **every** supported version

The emulator cannot reproduce these bugs. It pipes host audio through a virtual device, does not enforce real background-service restrictions, and has no Doze mode or OEM battery management. Physical devices only.

### Minimum device coverage
- One device at the **lowest supported** Android version
- One device on **Android 15 (API 35)**
- Ideally one **non-Pixel OEM** (Samsung, Xiaomi, Oppo or Vivo) — their mic arbitration and battery management differ most

### Per-device phone setup
- Settings → Apps → Think Tap → Permissions → Microphone → **Allow**
- Settings → Apps → Think Tap → Battery → **Unrestricted**
  *(without this, OEM battery management kills the recorder and you will debug the wrong thing)*

### Matrix — run in full on each device

| # | Scenario | Wake | Pass criteria |
|---|---|---|---|
| A | Tap mic, speak 15s, tap stop | off | Full transcript; audio plays back |
| B | Tap Pause, then Resume, then Stop | off | Same take continues; duration correct |
| C | "hey think tap", speak 15s | on | Starts; full transcript |
| D | "hey think tap start" | on | Starts |
| E | While recording, "stop recording" | on | Stops, saves |
| F | While recording, "hey think tap stop" | on | Stops — **must not restart** |
| G | "pause recording" then "resume recording" | on | Pauses and resumes same take |
| H | App backgrounded, "hey think tap" | on | App comes forward, starts |
| I | Screen locked, "hey think tap" | on | Starts, or fails gracefully with no crash |
| J | Incoming call mid-recording | on | Pauses, does not auto-resume |
| K | Airplane mode, full capture | either | **Audio saved; thought not lost** |
| L | Record 60s continuously | either | No truncation, no session restart gaps |

**K is the most important test.** Per spec, losing a captured thought is the highest-severity failure.

### Record results per device

| Test | Device 1 (Android __) | Device 2 (Android __) | Device 3 (Android __) |
|---|---|---|---|
| A | | | |
| B | | | |
| … | | | |

A fix is not complete until the same row passes on every device. If a row passes on one version and fails on another, the fix is version-specific and needs reworking as a capability check per §3.

---

## 14. Priority order

1. **§3 single code path** — unblocks §2 and §4, and removes version branching
2. **§9 manual mode** — the spec's primary mechanism, no version-specific code, best health baseline
3. **§5 duplicate mounts** — re-verify after 1 and 2
4. **§6 wake phrases** — needs a native rebuild
5. **§10 cloud STT** — the real accuracy fix
6. **§11 key rotation** — before any release
7. **§8 server** — external dependency, not app work
8. **§7 multilingual** — deferred; needs a product decision first

---

## 15. Open questions for the product owner

1. **Minimum supported Android version?** This determines how much of the §3 fallback path needs to exist.
2. **Live transcript vs guaranteed audio file** — if a device cannot do both, the fallback drops the live view. Acceptable, or should such devices be told explicitly?
3. **Code-switching** — preserve mixed languages verbatim, or normalise to one? (Spec §4 implies verbatim.)
4. **Who operates `thinktapai.shastrarth.in`?** Is the code in `server/` the same service?
5. **Which physical devices are available for testing?** The matrix in §13 cannot be completed without them, and no fix here should be considered done until it is.
