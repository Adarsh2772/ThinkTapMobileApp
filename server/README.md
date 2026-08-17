# ThinkTap STT proxy

Thin Node/Express proxy so Groq / OpenAI API keys stay off the Expo app binary.

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

When `EXPO_PUBLIC_API_URL` is set, the app calls `POST /api/enrich` instead of calling Groq/OpenAI directly.

Use your machine’s LAN IP (not `localhost`) when testing on a physical device.

## Endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | — | `{ ok, provider, sttModel }` |
| POST | `/api/transcribe` | multipart `file` | `{ text, language }` |
| POST | `/api/enrich` | multipart `file` | enrichment + `detectedLanguage` |

Language is **never** sent to Whisper — the model auto-detects the spoken language.

## Production notes

- Rate-limit this service (e.g. per user / IP).
- Put TLS in front (reverse proxy).
- Delete temp audio after processing when you add disk storage.
- Files over ~25 MB: chunk (~10 min), transcribe each piece with a prior-segment prompt, then concatenate.
- Cost: ~$0.004–0.006 per audio minute (Whisper / gpt-4o-transcribe class).
