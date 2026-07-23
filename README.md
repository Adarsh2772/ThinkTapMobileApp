# Think Tap (OneTap) — Mobile App

Voice-first idea capture for Android and iOS. Tap to record → AI transcribes, titles, tags, and summarizes → ideas live in a searchable archive.

**Design reference:** [Stitch — Think Tap](https://stitch.withgoogle.com/preview/7240260240508960783?node-id=095cb0509f804164959e531f4b1babcd)  
**Client docs:** `stitch_think_tap_mobile_app/`, `OneTap_Mobile_App_Technical_Document.pdf`  
**Branding note:** Stitch UI uses **Think Tap** / Idea Bank; the technical PDF uses **OneTap**. Confirm final product name with the client before store submission.

---

## Getting started (Phase 0–1 MVP)

```bash
npm install
npx expo start
```

- Press `a` for Android emulator / device, `i` for iOS simulator (macOS).
- Create an account in-app, then use **Tap to Record** on Home.
- Mock AI is on by default (`EXPO_PUBLIC_USE_MOCK_AI=true`). See `.env.example`.

### MVP implemented

- Auth (email/password, local persistence)
- Tabs: Home, Ideas, Search, Settings
- Record → Processing → Idea detail
- Ideas list + category filters + text search
- Design tokens from Stitch / `DESIGN.md`

---

## 1. Product summary

Think Tap helps creators capture thoughts hands-free and turn them into organized, searchable ideas.

| Layer | Source | Role |
|-------|--------|------|
| Product UX | Stitch screens + `DESIGN.md` | Visual design, flows, copy |
| Engineering depth | OneTap technical document | Auth, encryption, AI pipeline, wake word, library, sharing |

**Guiding principle:** Ship a solid **MVP** matching Stitch first. Deliver OneTap advanced features in later phases.

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

Work is split into **MVP** and **post-MVP phases**. Implementation must follow this order unless the client re-prioritizes in writing.

```text
Phase 0  → Project setup (Expo)
Phase 1  → MVP (Stitch core loop)     ← primary delivery target
Phase 2  → Library polish & sharing
Phase 3  → Multi-language AI
Phase 4  → Security (encryption / .onetap)
Phase 5  → Wake word (Android first)
Phase 6  → Biometrics, deep links, store hardening
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

## 6. Phase 1 — MVP (in scope — implement first)

**Goal:** End-to-end loop matching Stitch. Target ~1 week with focused RN development + AI-assisted coding.

### 6.1 Authentication

- [ ] Email/password sign-up and login
- [ ] Session persistence (auto login on relaunch)
- [ ] Logout
- [ ] Per-user data isolation (ideas belong to signed-in user)
- [ ] Validation: required fields, password rules (align with PDF: 8+ chars, uppercase, number — confirm with client)
- [ ] Clear error messaging (including duplicate account if backend supports it)

**MVP optional (nice-to-have if time):**

- [ ] Soft onboarding: allow recording before login, migrate ideas on sign-in (from OneTap PDF — defer if it risks MVP timeline)

### 6.2 Navigation & shell

- [ ] Bottom tabs: **Home**, **Ideas**, **Search**, **Settings**
- [ ] Stack screens: Processing, Idea Details, Auth screens
- [ ] Match Stitch layout, active tab accent, glass/blur bottom bar where feasible

### 6.3 Home

- [ ] Personalized greeting (“Hello, {name}”)
- [ ] Recent Ideas list (title, category chip, relative date, duration)
- [ ] “View all” → Ideas tab
- [ ] Large center **Tap to Record** mic button with pulse animation
- [ ] Helper copy: AI will transcribe and categorize

### 6.4 Recording

- [ ] One-tap start / stop recording
- [ ] Live timer during recording
- [ ] Mic permission handling (Android + iOS)
- [ ] Pause / resume (include if straightforward with Expo Audio; otherwise Phase 2)
- [ ] Discard recording without saving
- [ ] Keep recording usable when app is backgrounded for short sessions (best-effort on MVP; full wake-lock behavior is Phase 5+)

### 6.5 AI processing pipeline

After stop:

1. Show **Processing** screen (“Organizing your idea…”)
2. Upload audio to secure storage
3. **Speech-to-text** (Whisper — OpenAI or Azure, per client credentials)
4. **LLM** generates:
   - Title
   - Category / tags (e.g. Movies, Business, Design, Music, Songs, Books, Scripts)
   - Short AI summary
5. Persist idea + transcript + audio URL
6. Navigate to Idea Details (or Ideas list)

- [ ] Stage-aware status text (e.g. transcribing → extracting themes → drafting summary)
- [ ] Block accidental back navigation during critical processing (or confirm cancel)
- [ ] Error handling: network failure, STT failure, LLM failure — retry + keep raw audio if possible

**MVP AI output:**

| Field | Required |
|-------|----------|
| Title | Yes |
| Category / tags | Yes |
| Summary | Yes |
| Full transcript (raw) | Yes |
| Polished “AI story” rewrite | Optional in MVP; preferred if time (PDF has Story + Raw tabs) |

### 6.6 Ideas / Archive

- [ ] List all user ideas
- [ ] Category filter chips (All + categories)
- [ ] Card: title, snippet/summary preview, category, date, duration, AI-transcribed indicator
- [ ] Tap → Idea Details
- [ ] Empty state

### 6.7 Idea details

- [ ] Title, category chip, date
- [ ] Audio player: play/pause, progress, duration
- [ ] AI Summary section
- [ ] Transcript section (scrollable)
- [ ] Basic actions: favorite/star (UI), more menu stub or delete

**MVP player extras (if time):** seek, ±10s, playback speed — otherwise Phase 2.

### 6.8 Search

- [ ] Text search over title, summary, transcript
- [ ] Suggested queries UI (can be static or derived from recent categories)
- [ ] Results list → Idea Details
- [ ] Empty / discovery state matching Stitch

**Out of MVP:** true semantic / vector “Deep Discovery” search (Phase 2+).

### 6.9 Settings (MVP)

- [ ] Profile basics (name, email)
- [ ] Logout
- [ ] App version
- [ ] Placeholders for language / wake word (disabled until later phases)

### 6.10 Backend (MVP)

Recommended default:

| Concern | Choice |
|---------|--------|
| Auth + DB + file storage | Supabase (Auth, Postgres, Storage) |
| STT | OpenAI Whisper **or** Azure Whisper |
| LLM | GPT-4o-mini / Azure GPT (title, tags, summary) |
| API keys | Server-side / Edge Functions only — never in app binary |

**Minimum data model — `ideas`:**

| Column | Type | Notes |
|--------|------|--------|
| id | uuid | PK |
| user_id | uuid | FK auth user |
| title | text | |
| category | text | |
| summary | text | |
| transcript | text | raw STT |
| ai_story | text | nullable MVP |
| audio_path | text | storage path/URL |
| duration_sec | number | |
| language | text | default `en` until Phase 3 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 6.11 MVP acceptance criteria

- [ ] User can sign up / log in
- [ ] User can record a voice idea on Android (and iOS if builds available)
- [ ] After recording, AI produces title, category, summary, transcript
- [ ] Idea appears in Home recent + Ideas list
- [ ] User can open detail, play audio, read summary/transcript
- [ ] User can search by text and find ideas
- [ ] UI reasonably matches Stitch light-mode design
- [ ] No secrets in source control

### 6.12 Explicitly out of MVP

- Wake word (“Hey OneTap” / “Hey Think Tap”)
- AES-256 / proprietary `.onetap` format
- Biometric login
- 10-language full pipeline + UI i18n
- Deep-link open of shared encrypted files
- Picovoice Porcupine
- Cross-app deferred share automation
- Full Redux architecture (optional; Zustand / Query is fine for MVP)

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

## 13. AI pipeline (logical flow)

```text
[Mic] → audio file
     → upload (Storage)
     → STT (Whisper) → raw transcript
     → LLM prompt → { title, category, summary [, ai_story] }
     → save row in DB
     → Idea Details UI
```

**Rules:**

- Raw transcript is the source of truth; never overwrite it with polished story.
- Processing UI must communicate stage (transcribe vs generate).
- Failures must not silently drop the user’s audio when avoidable.

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

Confirm before or during Phase 1:

1. Final product name: Think Tap vs OneTap  
2. STT/LLM provider: OpenAI vs Azure (and who owns the keys)  
3. Auth method: email only vs Google/Apple Sign-In  
4. Anonymous record-before-login: in MVP or later?  
5. Categories list (final taxonomy)  
6. Android-only first release vs Android + iOS together  
7. Whether Phase 4–5 (encryption, wake word) are contracted in v1 or roadmap  

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
| Technical PDF | `OneTap_Mobile_App_Technical_Document.pdf` |
| Stitch HTML + PNGs | `stitch_think_tap_mobile_app/` |
| Design tokens | `stitch_think_tap_mobile_app/zenith_archive/DESIGN.md` |
| Stitch preview | https://stitch.withgoogle.com/preview/7240260240508960783?node-id=095cb0509f804164959e531f4b1babcd |

---

## 18. Implementation order (team rule)

1. Read this README and Stitch screens.  
2. Implement **Phase 0 + Phase 1 only** until MVP acceptance is signed off.  
3. Do not pull Phase 4–5 work into MVP unless the client explicitly expands scope and timeline.  
4. When adding native modules, document them under Phase 4/5 and use Expo Dev Client.

---

*Scope derived from client Stitch package, OneTap technical document (v1.0, July 2026), and agreed build plan (Expo, MVP-first, phased advanced features).*
