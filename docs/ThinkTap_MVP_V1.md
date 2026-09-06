# ThinkTap MVP V1 — Working Specification

Source of truth for product intent: `docs/ThinkTap_MVP_V1_Specifications.docx`  
Human Thought Operating System (HTOS) — V1 build  
Voice-only capture · Zero manual structuring · AI organizes, not the user

This markdown is the team-facing working spec. It records **what this first version ships**, then maps the rest of the Word document so later work does not rewrite capture or the Human Signal.

---

## Current first version (this build)

The first version is deliberately narrow. It exists to prove the Core Hypothesis: people will capture authentic thoughts if the process is effortless, and those thoughts stay findable from remembered fragments.

| Capability | In this build | Notes |
|------------|---------------|--------|
| **Start / stop recording** | Yes | Tap the mic to start; tap again to stop. Pause/resume and spoken “stop” remain as already implemented. Hands-free auto-start / silence-stop is still open R&D (Word spec §10). |
| **Raw transcribed data** | Yes | The verbatim speech-to-text output is the **Human Signal**. It is stored permanently, shown in full on the thought view, and is never overwritten by titles, summaries, or analysis. |
| **Search** | Yes | Retrieval runs on the full Human Signal (raw transcript), as specified in Word spec §8. |

Everything else in the Word spec (ThinkFlow coaching copy, structured Source + Thought extraction, AI Core Insight as a required card field, Deep Intelligence, Retap, pricing gates) is **full V1 / next build**. Do not pull those into this first version unless the founder expands scope in writing.

### Capture → preserve → find (this build)

```text
User taps Start
     ↓
User speaks
     ↓
User taps Stop
     ↓
Audio is saved locally (capture must not depend on network)
     ↓
Speech-to-text produces raw transcript  ← Human Signal
     ↓
Thought is stored (transcript is source of truth)
     ↓
User searches remembered fragments
     ↓
Results come only from the raw transcript
     ↓
User opens the thought and reads the full raw transcript
```

---

## 1. Mission (orientation, not a feature list)

ThinkTap exists so a thought can be preserved the moment it is born — without typing, organizing, or interrupting the flow of life. Technology adapts to the human mind; the human mind should not have to adapt to the product.

**HTOS** is a long-term identity, not a V1 feature: organize, preserve, and grow human thinking without becoming the author of that thinking.

**Core Hypothesis (what V1 tests):** people will consistently capture authentic thoughts if capture is effortless, and those thoughts become more valuable as they become easy to rediscover.

Initial user (strategy, not architecture): filmmakers and creative storytellers. Nothing in the data model should be filmmaking-specific.

---

## 2. Product principles that bind this build

When in doubt:

1. Volume of authentic capture beats every other metric.
2. Simplicity and low distraction beat feature richness.
3. Authenticity beats completeness — preserve gaps; do not fill them.
4. The **Human Signal always outranks AI output**.

### Human Signal vs later AI layers

| Layer | What it is | This build |
|-------|------------|------------|
| **Human Signal** | Exactly what the user said, preserved verbatim. Light filler/grammar cleanup only if it does not change meaning. | **Shipped.** Raw transcript. Source of truth. Search index. |
| **AI Core Insight** | Short, faithful recognition aid from one thought. Never used as the retrieval index. | Not required in this build. If analysis already exists in the app, it must never replace or index instead of the raw transcript. |
| **AI Intelligence** | Classification, connections, opportunity generation. Always optional and labeled speculative. | Not this build (next build / Word spec §11). |

**Search rule (Word spec §8):** search always runs on the Human Signal, never on AI Core Insight.

---

## 3. Start / stop recording (this build)

**Shipped mechanism:** single-tap start, single-tap stop on the Capture (Home) screen.

| Start | Stop |
|-------|------|
| Tap the mic. Mic permission is requested if needed. | Tap the mic again. Recording is saved even if transcription is delayed. |
| Optional: existing wake phrase / spoken start where already implemented. | Optional: existing spoken “stop recording” where already implemented. |

**Open (Word spec §10 — do not block this build):**

- Always-listening / lock-screen / hardware-button start (platform R&D, especially iOS).
- Silence-detection auto-stop vs a trigger phrase such as “TT stop”. Silence detection is the required *eventual* language-agnostic fallback; it is not a gate for this first version.

**Non-functional (Word spec §13):**

- Losing a captured thought is the highest-severity failure. Save audio first; attach transcript when ready.
- Capture must feel instant. Network or AI downtime must not block preservation.

---

## 4. Raw transcribed data — Human Signal (this build)

| Rule | Detail |
|------|--------|
| Field | `transcript` on the thought / idea record |
| Content | Verbatim speech-to-text in the language spoken |
| Cleanup allowed | Light filler-word / grammar cleanup that does **not** change meaning |
| Never | Rewrite, summarize, merge, infer, or replace the transcript with a title, story, or analysis |
| Language | Auto-detect where the STT provider supports it; do not require a language pick before record |
| Display | Full raw transcript on the Expanded Thought View |
| Retrieval | This field is the only search index in this build |

Structured Human Signal fields from the Word spec (Source of Inspiration, Thought as a *split* extraction) stay **inside the raw transcript** for this first version. They are not extracted as separate required columns yet (Word spec §7.1 / §4.1 — full V1).

System metadata that must exist for search sorts: unique id, capture timestamp. **Last-accessed timestamp** is required for Recently Visited and Dormant Gems (Word spec §7.3).

---

## 5. Search (this build — Word spec §8)

Search is how a thought becomes valuable after capture. A free user must never miss their own thought because they phrased the query differently than the original capture.

### 5.1 Index

- Run against the **full raw transcript** (Human Signal) only.
- Do **not** use AI Core Insight, title, category, or analysis buckets as the retrieval index.
- Display fields on a result card may include later AI text, but matching does not.

### 5.2 Progressive refinement

The user adds remembered fragments one at a time (typed into one field). Each added fragment **narrows** the result set (AND semantics). Removing a fragment widens it again.

Example: `rain` → `rain movie` → `rain movie father` each step returns a subset of the previous results.

### 5.3 Semantic matching (Free — not a paid add-on)

Matching recognizes different phrasings of the same concept. Searching “Bollywood movie” must also surface a thought that only ever said “movie in Bollywood.”

This is **matching, not correction**: neither the query nor the original transcript is rewritten.

This first version implements that with phrase / synonym / token matching on-device. Embedding / vector “Deep Discovery” can replace the matcher later without changing the Human Signal or the card contract.

### 5.4 Sorting

| Sort | Behavior |
|------|----------|
| **Best Match** (default) | Rank by how well fragments hit the Human Signal |
| **Newest First** | `createdAt` descending |
| **Oldest First** | `createdAt` ascending |
| **Recently Visited** | `lastAccessedAt` descending (thoughts never opened are excluded) |
| **Dormant Gems** | Basic heuristic: older thoughts that have not been opened recently (or never) |

### 5.5 Result card

Word spec: Source + Thought + AI Core Insight, each independently truncated to the card, ending in an ellipsis (…).

This first version:

| Card row | Source | Required now? |
|----------|--------|----------------|
| **Thought** | Raw transcript (Human Signal) | **Yes** — always shown, truncated with … |
| **Source of Inspiration** | Only if already extracted on the record | Optional; omit the row if empty |
| **AI Core Insight** | Only if already present (must not be the index) | Optional; omit the row if empty |

Tapping a card opens the Expanded Thought View (full raw transcript, audio if present).

### 5.6 Pricing note (from spec — not billed in this build)

The matching itself is Free for every user. Gating “these two thoughts are related” callouts is a later Intelligence / Retap concern (Word spec §8 / §11).

---

## 6. Screens for this first version

Word spec V1 names three screens: **Capture**, **Search**, **View**. The Expo app may still show Ideas / Settings from earlier work; they must not become a substitute for Capture + Search + View.

| Screen | Job in this build |
|--------|-------------------|
| **Capture (Home)** | Start / stop only. Nothing else competes for attention during a take. |
| **Search** | Type fragments; progressive results; sorts above; cards as §5.5. |
| **View** | Full raw transcript; play audio; delete. Persistent path back to Capture. |

A persistent capture control from Search / View (floating button) is specified for full V1; Home tab capture is sufficient for this first version.

---

## 7. Full Word-spec V1 vs this build

| Word spec §4.1 item | This first version |
|---------------------|--------------------|
| Voice capture start/stop | **Shipped** (tap; R&D items still open) |
| ThinkFlow coaching prompt | Not this build |
| Extract Source of Inspiration + Thought as two fields | Not this build — kept inside raw transcript |
| AI Core Insight generation | Not required; must not become the search index |
| Hidden AI Intelligence tagging | Not this build |
| Semantic search over Human Signal | **Shipped** (on-device matcher) |
| Search cards + five sorts | **Shipped** (optional Source / Insight rows) |
| Expanded Thought View | **Shipped** (full raw transcript) |
| Local-first storage | **Shipped** (on-device) |
| Free / Subscription pricing UI | Not this build |
| Delete a thought | Already in the app; keep |

### Explicitly out of this build (and out of Word-spec V1)

Manual folders, tags, titles, or categorization as a *user job*. Editing the Human Signal. Collaboration / sharing. AI co-writing. Knowledge graphs. Task / calendar integrations.

### Next build (Word spec §11 — not this version)

Deep AI Intelligence (Relativity Rule) and Retap notifications.

### Further out (Word spec §14)

Marketplace, publishing, outcome-based content generation.

---

## 8. Data contract (this build)

Minimum thought record:

| Field | Role |
|-------|------|
| `id` | Unique thought id |
| `userId` | Owner |
| `transcript` | **Human Signal — raw STT, source of truth, search index** |
| `audioUri` | Local (or later signed) audio path |
| `durationSec` | Length of take |
| `language` | Detected spoken language when known |
| `createdAt` | Capture time (Newest / Oldest) |
| `lastAccessedAt` | View time (Recently Visited / Dormant Gems); null until opened |
| `updatedAt` | Record maintenance only — opening a thought must not pretend it was re-captured |

Existing fields (`title`, `category`, `summary`, `analysis`, `aiStory`) may remain for compatibility with code already in the app. They are **not** the first-version product contract and must not overwrite `transcript`.

---

## 9. Document map

| Asset | Path |
|-------|------|
| Product specification (Word) | `docs/ThinkTap_MVP_V1_Specifications.docx` |
| This working spec | `docs/ThinkTap_MVP_V1.md` |
| Indian multilingual STT notes | `docs/AI-Indian Multilingual.md` |
| Backend API guide (Word) | `docs/ThinkTap_Backend_API_Implementation_Guide.docx` |
| STT proxy | `server/README.md` |
| App README | `README.md` |
