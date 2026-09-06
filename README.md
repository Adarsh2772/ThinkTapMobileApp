# ThinkTap — Mobile App

Voice-only thought capture for Android and iOS. **Start recording → stop recording → keep the raw transcript → find it again from remembered fragments.**

Product specification: `docs/ThinkTap_MVP_V1_Specifications.docx`  
Working spec for this build: [`docs/ThinkTap_MVP_V1.md`](docs/ThinkTap_MVP_V1.md)

**Design reference:** [Stitch — Think Tap](https://stitch.withgoogle.com/preview/7240260240508960783?node-id=095cb0509f804164959e531f4b1babcd)  
**Also in repo:** `stitch_think_tap_mobile_app/`, `OneTap_Mobile_App_Technical_Document.pdf` (historical engineering depth — do not expand this first version to match the full PDF).

---

## Current first version

This is the ship target. It is smaller than the full Word-spec V1 on purpose.

| Capability | What it means |
|------------|----------------|
| **Start / stop recording** | Tap the mic on Home to start; tap again to stop. Audio is saved locally even if the network is down. |
| **Raw transcribed data** | Speech-to-text is stored as the **Human Signal** (`transcript`). It is never overwritten by a title, summary, or analysis. The thought view shows this text in full. |
| **Search** | Retrieval runs **only** on the raw transcript (Word spec §8). Type remembered fragments; results narrow as you add words. Sort: Best Match, Newest, Oldest, Recently Visited, Dormant Gems. |

Search does **not** use AI insight as the index. Matching is Free: a different phrasing of the same idea must still find the original words.

Hands-free auto-start, silence auto-stop, ThinkFlow, split Source/Thought extraction, Deep Intelligence, and Retap are **not** this first version. See the working spec.

---

## Getting started

```bash
npm install
npx expo start
```

- Press `a` for Android emulator / device, `i` for iOS simulator (macOS).
- **Tap to Record** on Home, speak, tap to stop. Open **Search** and type a fragment from what you said.
- STT: device speech recognition and/or the proxy in `server/` (see `.env.example`). Do not put production API keys in `EXPO_PUBLIC_*`.

---

## 1. Product summary

ThinkTap is the first implementation of a Human Thought Operating System (HTOS): preserve what the person said, then make it findable. AI may organize later; it must never become the author of the thought.

| Layer | Source | Role |
|-------|--------|------|
| Product (this build) | `docs/ThinkTap_MVP_V1_Specifications.docx` + `docs/ThinkTap_MVP_V1.md` | Start/stop, raw transcript, search |
| Product UX visuals | Stitch screens + `DESIGN.md` | Layout, type, color |
| Later engineering | OneTap technical PDF, backend API Word doc | Auth, cloud, encryption, wake word — after this build |

---

## 2. Platforms & approach

| Item | Decision |
|------|----------|
| Platforms | Android + iOS |
| Framework | **React Native with Expo** (TypeScript) |
| Why Expo | Faster MVP; auth, recording, AI, lists work without bare CLI |
| Native modules later | Supported via **Expo Dev Client** + config plugins / custom Kotlin–Swift |
| When to go bare | Only if Phase 1 must include wake word + proprietary encryption from day one (not recommended) |

**iOS note:** App Store / device builds require a paid Apple Developer account (as noted in the OneTap PDF).

---

## 3. Design system (from Stitch)

Implement UI to match `stitch_think_tap_mobile_app/zenith_archive/DESIGN.md` and the HTML/screen mockups.

### Brand & aesthetic

- Modern minimalism — “Invisible AI”
- Light mode primary; calm, high-trust, digital-stationery feel
- Inspiration: Linear / Apple utility apps (not neon AI glow)

### Core tokens

| Token | Value / notes |
|-------|----------------|
| Background | `#f9f9ff` / light surface |
| Primary | `#000000` / `#111111` |
| Accent (AI / focus) | `#4b41e1` / `#4F46E5` |
| Success | `#22C55E` |
| Borders | `#E0E0E0` / outline variants |
| Text secondary | `#6B7280` / on-surface-variant |

### Typography

| Role | Font |
|------|------|
| Headlines | Hanken Grotesk |
| Body | Inter |
| Labels / chips | Geist |

### Layout

- Horizontal margin: 20px  
- Spacing scale: 8px base (8 / 16 / 32 / 48)  
- Soft-modern radii: ~8px controls, 16–24px cards  
- Bottom nav + safe-area padding for home indicator  

### Screens in design package

| Screen | Folder | Purpose |
|--------|--------|---------|
| Home | `stitch_think_tap_mobile_app/home/` | Greeting, recent ideas, primary mic CTA |
| Ideas / Archive | `ideas_list/` | Full list, category chips, idea cards |
| Processing | `processing/` | AI organizing state |
| Idea details | `idea_details/` | Player, AI summary, transcript |
| Search | `search/` | Query + suggestions + discovery empty state |

---

## 4. Scope of work — overview

Work is split into **this first version**, **full Word-spec V1 leftovers**, and **later phases**. Do not pull later phases into the first version unless the founder expands scope in writing.

```text
This build     → Start / stop + raw transcript + search (§8)
Full V1 leftover → ThinkFlow, Source+Thought split, AI Core Insight cards
Next build     → Deep Intelligence + Retap (Word spec §11)
Later          → Library polish, encryption, production wake word, store
```

---

## 5. Phase 0 — Project setup (in scope)

- [ ] Initialize Expo (TypeScript) app
- [ ] Expo Router (or React Navigation) with typed routes
- [ ] Design tokens / theme matching `DESIGN.md`
- [ ] Folder structure (feature-first recommended)
- [ ] Environment config (API keys via env — never commit secrets)
- [ ] EAS Build project for Android (and iOS when Apple account available)
- [ ] Basic CI or lint/format baseline (optional but preferred)

**Suggested structure:**

```text
src/
├── features/
│   ├── auth/
│   ├── recording/
│   ├── ideas/
│   ├── search/
│   └── settings/
├── navigation/
├── services/          # AI, storage, API clients
├── components/
├── theme/
└── i18n/              # Phase 3+
```

---

## 6. This first version (in scope — implement and keep)

**Goal:** Capture without friction, store the raw words, find them again. Match Word spec §8 for search. Do not make the user title, tag, or file the thought.

### 6.1 Capture (Home)

- [x] One-tap **start** and **stop**
- [x] Live timer while recording
- [x] Mic permission handling (Android + iOS)
- [x] Discard current take without saving
- [x] Save audio locally first so a transcription failure cannot drop the thought

Pause / resume and spoken stop are already in the app; they are helpers, not a substitute for tap start/stop.

**Still open (Word spec §10):** always-on background start, lock-screen / hardware shortcuts, silence-detection auto-stop.

### 6.2 Raw transcript (Human Signal)

After stop:

1. Persist the take (audio + empty or partial transcript if needed).
2. Run speech-to-text (device OS and/or `server/` Whisper proxy).
3. Write **`transcript`** as the verbatim result. Never overwrite it with LLM title, summary, story, or analysis.

- [x] Thought view shows the full raw transcript
- [x] Language auto-detect when the STT provider returns it
- [ ] Light filler/grammar cleanup only if it does not change meaning (do not invent content)

Titles, categories, summaries, and analysis may still exist in storage from earlier work. They are **not** the first-version contract and must not become the search index.

### 6.3 Search (Word spec §8)

- [x] Index = full Human Signal (`transcript`) only
- [x] Progressive refinement: each extra fragment ANDs and narrows results
- [x] Phrase / synonym matching so “Bollywood movie” can hit “movie in Bollywood”
- [x] Sorts: Best Match (default), Newest First, Oldest First, Recently Visited, Dormant Gems
- [x] Result card: Thought = truncated raw transcript (…); Source / AI Core Insight rows only if already present
- [x] Empty / no-match states
- [x] Open result → full transcript view

**Not this build:** vector embeddings, “these thoughts are related” gated callouts, using insight text as the index.

### 6.4 Navigation & view

- [x] Tabs include **Home (Capture)** and **Search**
- [x] Expanded view: full raw transcript, audio playback, delete
- [x] Last-accessed timestamp for Recently Visited / Dormant Gems (opening a thought must not change `createdAt`)

Ideas / Settings tabs may remain from earlier work; they must not replace Capture + Search + View.

### 6.5 Backend (this build)

| Concern | This build |
|---------|------------|
| Thoughts + audio | Local (AsyncStorage + document directory) |
| STT | Device STT and/or `server/` proxy (`POST /api/speech-to-text` or `/api/transcribe`) |
| API keys | Server-side only in production |
| Search | On-device over `transcript` |

Minimum record: `id`, `userId`, `transcript`, `audioUri`, `durationSec`, `language`, `createdAt`, `lastAccessedAt`, `updatedAt`.  
`transcript` is never replaced by `aiStory` / summary / analysis.

### 6.6 Acceptance criteria (this first version)

- [ ] User can start and stop a recording on Android (and iOS if builds exist)
- [ ] After stop, the thought is kept; the raw transcript appears when STT succeeds
- [ ] User can open the thought and read the **full raw transcript** (and play audio)
- [ ] User can search remembered fragments and find the thought from the **transcript**, including different word order / common synonyms
- [ ] Sorts work as listed in §6.3
- [ ] A failed STT or network call does not delete the audio
- [ ] No secrets in source control

### 6.7 Explicitly out of this first version

- ThinkFlow prompt, required AI Core Insight, Deep Intelligence, Retap
- User-authored folders, tags, titles, or categories as the way to organize
- Editing or rewriting the Human Signal
- Collaboration, sharing, marketplace
- AES-256 / `.onetap`, biometrics, production always-on wake word
- Charging to capture or to find a thought you already captured

---

## 7. Phase 2 — Library polish & sharing (post-MVP)

- [ ] Rename / delete idea with confirmation
- [ ] Inline edit AI summary / story; save / cancel
- [ ] Preserve original AI text; revert after edit
- [ ] “Edited” badge on cards
- [ ] Regenerate AI content with overwrite confirmation if edited
- [ ] Full player: seek bar, ±10/15s, speed control
- [ ] Share transcript (formatted text) via native share sheet
- [ ] Share audio file (plain audio for MVP share; encrypted format in Phase 4)
- [ ] Deferred share after login (if anonymous recording exists)
- [ ] Improved empty states and loading skeletons

---

## 8. Phase 3 — Multi-language AI (post-MVP)

From OneTap PDF:

- [ ] STT + generation support for: English, Hindi, Marathi, French, Spanish, Arabic, Chinese, Japanese, German, Portuguese
- [ ] Language select before/after recording; regenerate in another language
- [ ] Auto language detection from audio where provider supports it
- [ ] UI language switching (start with English + Hindi + Marathi, expand)
- [ ] Show detected language on idea cards

---

## 9. Phase 4 — Security & proprietary format (post-MVP)

- [ ] AES-256 encryption of audio (encrypt before disk / storage as required)
- [ ] Per-user key material in secure platform storage (Keychain / Keystore) — not AsyncStorage
- [ ] Proprietary opaque format (e.g. `.onetap`) optional if client still requires it
- [ ] Decrypt only in memory for playback / STT upload
- [ ] HTTPS-only APIs; rotate keys; no keys in repo
- [ ] Import encrypted file from device storage (if format adopted)

**Requires:** Expo Dev Client / custom native modules as needed.

---

## 10. Phase 5 — Wake word (post-MVP)

Hands-free: say wake phrase → start recording.

### Implemented (foreground MVP)
- [x] Settings toggle: enable / disable **Hey Think Tap**
- [x] Device speech recognition via `expo-speech-recognition` (phrase match + phonetic variants)
- [x] On detect → pause wake listen → start recording on Home
- [x] Debounce / no double-trigger; release mic while recording

**How to use:** Settings → turn on **Hey Think Tap** → keep the app open on Home → say “Hey Think Tap” or “start recording”.

**Build note:** Works best with a **development build** (`npx expo run:android` / `run:ios`). Expo Go may lack or limit continuous speech recognition. Pocket / screen-off wake word still needs a native foreground service.

### Still roadmap
- [ ] Android foreground service + persistent “listening” notification
- [ ] Confirmation beep on detect
- [ ] Bring app to foreground from killed/background state
- [ ] Porcupine (or similar) offline wake-word model for lower battery + higher accuracy

**Platform priority:** Android first. iOS always-on mic is a separate App Store scoping exercise.

**Requires (full pocket mode):** custom native module (Kotlin) via Expo Dev Client.

---

## 11. Phase 6 — Production hardening (post-MVP)

- [ ] Biometric unlock for returning users
- [ ] Deep links for shared idea / `.onetap` files
- [ ] Background recording reliability (wake locks, notification tap-to-return)
- [ ] Android 14+ foreground service types / permissions compliance
- [ ] Battery and permission UX review
- [ ] Crash reporting + analytics (privacy-aware)
- [ ] App Store / Play Store assets, privacy policy, permission justifications
- [ ] QA matrix: low network, denied mic, large libraries, long recordings

---

## 12. Recommended technical stack

| Area | MVP | Later |
|------|-----|--------|
| App | Expo + TypeScript | Expo Dev Client |
| Navigation | Expo Router | same |
| UI | Custom components + theme tokens | same |
| State | Zustand + TanStack Query | Redux Toolkit if team prefers OneTap parity |
| Auth / DB / Storage | Supabase | or Azure-aligned backend if client mandates |
| STT | Whisper | Azure Whisper |
| LLM | GPT-4o-mini | Azure GPT-4.1-mini (per PDF) |
| Audio | `expo-audio` | + native as needed |
| Builds | EAS Build | + custom native |

---

## 13. Capture pipeline (this first version)

```text
[Mic start] → [Mic stop]
     → save audio locally
     → STT (device and/or Whisper proxy) → raw transcript
     → persist Human Signal (transcript)  ← never overwrite
     → Search indexes transcript only
     → Thought view shows full transcript
```

**Rules:**

- Raw transcript is the source of truth; never overwrite it with title, summary, story, or analysis.
- Capture must not depend on network or LLM availability.
- Failures must not silently drop the user’s audio.
- Search matching is not a paid feature.

---

## 14. Tooling & delivery method

| Tool | Use |
|------|-----|
| Cursor / Claude Code / Codex | Accelerate UI, API, boilerplate — preferred |
| Lovable | **Not preferred** for production Android/iOS (web-oriented) |
| Traditional engineering | Required for Phases 4–6 (native, security, store QA) |

Delivery style: **AI-assisted Expo development** for Phase 1; **structured phased engineering** for advanced OneTap features.

---

## 15. Client / stakeholder checklist

Confirm during this first version:

1. Final product name: ThinkTap vs Think Tap vs OneTap  
2. STT provider for raw transcript (device vs Groq/OpenAI Whisper vs BharatGen)  
3. Android-only first release vs Android + iOS together  
4. When to pull Word-spec leftovers (ThinkFlow, Source/Thought split) into a later build  
5. Capture start/stop R&D (Word spec §10) vs tap-only for launch  

---

## 16. Definition of done (per feature)

A feature is done when:

- It matches agreed scope for its phase  
- It works on target platform(s) with real devices where possible  
- Errors are handled and permissions are explained  
- No secrets committed  
- UI aligns with Stitch tokens for user-facing screens  
- Acceptance criteria for that phase are checked off  

---

## 17. Document map

| Asset | Path / link |
|-------|-------------|
| Product spec (Word) | `docs/ThinkTap_MVP_V1_Specifications.docx` |
| Working spec (this build) | `docs/ThinkTap_MVP_V1.md` |
| Indian multilingual STT | `docs/AI-Indian Multilingual.md` |
| Backend API guide (Word) | `docs/ThinkTap_Backend_API_Implementation_Guide.docx` |
| STT proxy | `server/README.md` |
| Technical PDF (historical) | `OneTap_Mobile_App_Technical_Document.pdf` |
| Stitch HTML + PNGs | `stitch_think_tap_mobile_app/` |
| Design tokens | `stitch_think_tap_mobile_app/zenith_archive/DESIGN.md` |
| Stitch preview | https://stitch.withgoogle.com/preview/7240260240508960783?node-id=095cb0509f804164959e531f4b1babcd |

---

## 18. Implementation order (team rule)

1. Read `docs/ThinkTap_MVP_V1_Specifications.docx` and `docs/ThinkTap_MVP_V1.md`.  
2. Keep **this first version** to start/stop recording, raw transcript, and search over that transcript.  
3. Do not pull ThinkFlow, Deep Intelligence, Retap, encryption, or production wake word into this build unless the founder expands scope.  
4. When adding native modules, document them under later phases and use Expo Dev Client.

---

*First-version scope derived from ThinkTap MVP V1 Product Specification (HTOS). Stitch and the OneTap PDF remain visual / later-engineering references.*
