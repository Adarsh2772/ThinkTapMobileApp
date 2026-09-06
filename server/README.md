# ThinkTap STT proxy

Thin Node/Express proxy so Groq / OpenAI API keys stay off the Expo app binary.

**This first version:** the proxy’s job is **raw speech-to-text** (Human Signal). The mobile app stores that transcript as the source of truth and searches it. Title/summary/enrichment endpoints may exist for later builds — they must never overwrite `transcript`. See `docs/ThinkTap_MVP_V1.md`.

## Setup

```bash
cd server
cp .env.example .env
# Put GROQ_API_KEY or OPENAI_API_KEY in .env (rotate any previously leaked keys)
npm install
npm start
```

## App config

In the Expo project `.env`:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8787
```

When `EXPO_PUBLIC_API_URL` is set, the app calls `POST /api/enrich` and `POST /api/speech-to-text` instead of calling Groq/OpenAI directly.

Use your machine’s LAN IP (not `localhost`) when testing on a physical device.

## Endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | — | `{ ok, provider, speechProvider, sttModel }` |
| POST | `/api/speech-to-text` | multipart `audio` or `file` | `{ success, transcription, language, audio? }` |
| POST | `/api/transcribe` | multipart `audio` or `file` | `{ text, language }` |
| POST | `/api/enrich` | multipart `audio` or `file` | enrichment + `detectedLanguage` |

Optional form fields: `preferredLanguage`, `conversationId`. Language is **never** sent to Whisper — the model auto-detects.

Set `SPEECH_PROVIDER=whisper` (default) or `bharatgen`. BharatGen returns 503 until an official API is configured.

## Production notes

- Rate-limit this service (e.g. per user / IP).
- Put TLS in front (reverse proxy).
- Delete temp audio after processing when you add disk storage.
- Files over ~25 MB: chunk (~10 min), transcribe each piece with a prior-segment prompt, then concatenate.
- Cost: ~$0.004–0.006 per audio minute (Whisper / gpt-4o-transcribe class).
