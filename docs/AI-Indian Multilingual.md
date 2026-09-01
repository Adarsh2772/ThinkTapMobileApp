# Indian Multilingual Speech-to-Text Implementation

**First-version product contract:** this STT output **is** the Human Signal — the raw transcript stored on the thought and the only search index. Do not send it through a chatbot, translation, or rewrite step before save. See `docs/ThinkTap_MVP_V1.md`.

---

I have an existing React Native Expo application.

I want to implement a **multilingual Indian Speech-to-Text feature**.

My primary requirement is to convert the user's recorded voice into text.

I do NOT currently need an AI chatbot, automatic AI response, or translation feature.

The main flow should be:

```text
User speaks
     ↓
App records audio
     ↓
Audio is sent to backend
     ↓
Speech-to-Text model processes audio
     ↓
Automatically detect the spoken Indian language
     ↓
Convert speech into text
     ↓
Return the original transcription in the same language
     ↓
Display the text in the Expo application
```

## Main Requirement

The system must automatically detect the language spoken by the user.

The user should NOT be required to manually select a language before recording.

The system should support as many Indian languages as supported by the selected BharatGen speech model or speech-to-text provider.

The architecture should be designed to support all major Indian languages, including where supported:

* Assamese
* Bengali
* Bodo
* Dogri
* Gujarati
* Hindi
* Kannada
* Kashmiri
* Konkani
* Maithili
* Malayalam
* Manipuri
* Marathi
* Nepali
* Odia
* Punjabi
* Sanskrit
* Santali
* Sindhi
* Tamil
* Telugu
* Urdu
* English / Indian English

The implementation should not hardcode the application to only Hindi, Marathi, or English.

It should dynamically support all languages available from the configured speech-to-text provider.

## Expected Behavior

### Example 1: English

User speaks:

> Hello, how are you?

Expected result:

```json
{
  "text": "Hello, how are you?",
  "language": "English",
  "languageCode": "en"
}
```

---

### Example 2: Marathi

User speaks:

> आज मी ऑफिसला जाणार आहे.

Expected result:

```json
{
  "text": "आज मी ऑफिसला जाणार आहे.",
  "language": "Marathi",
  "languageCode": "mr"
}
```

The Marathi transcription should remain in Marathi/Devanagari script.

Do not translate it into English.

---

### Example 3: Hindi

User speaks:

> आज मौसम बहुत अच्छा है।

Expected result:

```json
{
  "text": "आज मौसम बहुत अच्छा है।",
  "language": "Hindi",
  "languageCode": "hi"
}
```

The Hindi transcription should remain in Hindi/Devanagari script.

Do not translate it.

---

### Example 4: Tamil

User speaks Tamil.

Expected result:

* Detect Tamil automatically.
* Return Tamil text in Tamil script.
* Do not convert it to English.
* Do not transliterate unless explicitly requested.

---

### Example 5: Telugu

User speaks Telugu.

Expected result:

* Detect Telugu automatically.
* Return Telugu text in Telugu script.
* Preserve the original language.

---

### Example 6: Hindi + English Mixed Speech

User says:

> कल मुझे meeting के लिए जाना है।

Expected result:

```json
{
  "text": "कल मुझे meeting के लिए जाना है।",
  "language": "hi-en",
  "languageCode": "hi-en"
}
```

The system should support natural Indian code-mixed speech where the speech provider supports it.

Do not unnecessarily translate mixed-language content.

---

## Important Transcription Rules

The Speech-to-Text system must follow these rules:

1. Automatically detect the spoken language.

2. Do not require the user to select a language manually.

3. Return the transcription in the same language spoken by the user.

4. Preserve the original script whenever supported.

5. Do not automatically translate the transcription into English.

6. Do not transliterate the output unless explicitly requested.

7. Support mixed-language Indian speech when the selected model supports it.

8. Preserve common English technical words naturally when spoken inside an Indian language.

For example:

```text
आज मेरी Zoom meeting है।
```

The output should not unnecessarily become:

```text
आज मेरी ज़ूम मीटिंग है।
```

unless the speech recognition model naturally produces that result.

9. Add punctuation where supported by the speech recognition model.

10. Preserve names, numbers, dates, locations, and technical terms as accurately as possible.

## Application Technology

The frontend is an existing:

```text
React Native
+
Expo
+
TypeScript
```

Please first analyze the existing project structure before making changes.

Do not modify unrelated functionality.

Use Expo-compatible libraries wherever possible.

## Frontend Requirements

Create a voice recording interface with:

* Start Recording button.
* Stop Recording button.
* Recording duration display.
* Recording indicator.
* Upload/processing state.
* Error handling.
* Display detected language.
* Display transcribed text.
* Copy transcription button.
* Clear/reset recording button.
* Ability to record another message.

The UI should clearly show the following states:

```text
Ready to Record
        ↓
Recording...
        ↓
Processing Audio...
        ↓
Language Detected
        ↓
Transcription Complete
```

## Suggested Response UI

Display:

```text
Detected Language:
Marathi

Transcription:

आज मी ऑफिसला जाणार आहे.
```

For mixed languages:

```text
Detected Language:
Hindi + English

Transcription:

कल मुझे meeting के लिए जाना है।
```

## Backend Architecture

The React Native application must not directly contain secret API keys.

Use this architecture:

```text
React Native Expo App
        ↓
HTTPS API Request
        ↓
Backend Server
        ↓
Speech-to-Text Provider
        ↓
Language Detection
        ↓
Return Transcription
        ↓
React Native Expo App
```

Create a clean API endpoint:

```text
POST /api/speech-to-text
```

The request should use:

```text
multipart/form-data
```

Example:

```text
audio: recorded audio file
```

Optional parameters:

```text
conversationId
preferredLanguage
```

However, `preferredLanguage` should be optional.

The primary behavior should always be automatic language detection.

## API Response Format

Return a structured response like:

```json
{
  "success": true,
  "transcription": "आज मी ऑफिसला जाणार आहे.",
  "language": {
    "code": "mr",
    "name": "Marathi",
    "confidence": 0.98
  },
  "audio": {
    "duration": 4.5
  }
}
```

For mixed-language audio:

```json
{
  "success": true,
  "transcription": "कल मुझे meeting के लिए जाना है।",
  "language": {
    "code": "hi-en",
    "name": "Hindi + English",
    "confidence": 0.92
  },
  "audio": {
    "duration": 5.2
  }
}
```

If the provider does not return language confidence, do not invent a fake confidence value.

Return only the information actually provided or reliably detected.

## Provider Architecture

I want to use BharatGen if its speech model and official integration options support this requirement.

However, do not tightly couple the entire application to BharatGen.

Create a provider abstraction.

Suggested structure:

```text
src/
├── services/
│   ├── speech/
│   │   ├── SpeechToTextProvider.ts
│   │   ├── BharatGenSpeechProvider.ts
│   │   └── index.ts
│
├── types/
│   └── speech.ts
│
├── api/
│   └── speechApi.ts
│
├── hooks/
│   └── useSpeechRecording.ts
│
└── components/
    ├── VoiceRecorder.tsx
    ├── RecordingControls.tsx
    └── TranscriptionResult.tsx
```

The architecture should allow changing providers later.

For example:

```typescript
interface SpeechToTextProvider {
  transcribe(audio: AudioInput): Promise<SpeechToTextResult>;
}
```

The result should contain something similar to:

```typescript
interface SpeechToTextResult {
  transcription: string;
  language?: {
    code?: string;
    name?: string;
    confidence?: number;
  };
}
```

Do not add fields unless they are actually available from the selected provider.

## BharatGen Integration

Before implementing BharatGen integration:

1. Check the official BharatGen documentation.
2. Verify the available speech-to-text models.
3. Verify supported Indian languages.
4. Verify whether automatic language detection is supported.
5. Verify whether code-mixed speech is supported.
6. Verify the official API endpoint and authentication method.
7. Verify the expected audio format.
8. Verify the maximum audio duration or file size.
9. Verify the exact request and response format.

IMPORTANT:

Do not invent:

* API URLs
* API keys
* SDK methods
* Authentication methods
* Model names
* Request formats
* Response formats

Only implement actual BharatGen API integration if the official documentation provides the required integration details.

If API access is unavailable, create the provider architecture so the BharatGen implementation can be added later.

## Environment Variables

Use environment variables.

Example:

```text
SPEECH_PROVIDER=bharatgen

BHARATGEN_API_KEY=
BHARATGEN_API_URL=
BHARATGEN_SPEECH_MODEL=
```

Do not hardcode secrets.

For the Expo application, secrets must remain on the backend.

## Audio Requirements

Analyze the best audio format generated by Expo and ensure it is compatible with the speech-to-text provider.

Handle:

* Android recording.
* iOS recording.
* Audio MIME type.
* File extension.
* File size validation.
* Empty recordings.
* Network upload errors.
* Unsupported audio formats.

If conversion is required on the backend, implement it separately.

Do not modify or corrupt the original audio unnecessarily.

## Implementation Steps

Follow this order:

### Step 1 — Analyze Existing Project

First inspect the existing Expo project and identify:

* Existing folder structure.
* Existing navigation.
* Existing API architecture.
* Existing state management.
* Existing environment configuration.
* Existing audio/recording functionality.

Do not make unnecessary architectural changes.

### Step 2 — Create Type Definitions

Create clean TypeScript types for:

* Speech recording.
* Audio upload.
* Speech-to-text result.
* Detected language.
* API response.
* Error states.

### Step 3 — Implement Audio Recording

Implement Expo-compatible audio recording.

Features:

* Start recording.
* Stop recording.
* Recording duration.
* Audio file URI.
* Proper permission handling.
* Cleanup after recording.

### Step 4 — Implement Backend API Integration

Create a reusable API service for:

```text
POST /api/speech-to-text
```

Send the recorded audio using multipart/form-data.

### Step 5 — Implement Speech Provider

Create a provider abstraction.

Implement BharatGen only after verifying official integration details.

The system should make it easy to replace BharatGen with another provider later.

### Step 6 — Implement UI

Create a clean and reusable speech recording screen/component.

Show:

```text
Microphone
↓
Start Recording
↓
Recording Duration
↓
Stop Recording
↓
Processing
↓
Detected Language
↓
Transcribed Text
```

### Step 7 — Error Handling

Handle:

* Microphone permission denied.
* Recording failure.
* Empty audio.
* Upload failure.
* Network timeout.
* Invalid API response.
* Speech recognition failure.
* Unsupported language.
* Provider unavailable.

Show user-friendly messages.

### Step 8 — Testing

Test with as many supported Indian languages as possible.

At minimum, test:

* English
* Hindi
* Marathi
* Gujarati
* Bengali
* Tamil
* Telugu
* Kannada
* Malayalam
* Punjabi

Also test:

* Hindi + English
* Marathi + English
* Other supported mixed-language speech

## Final Deliverables

After implementation, provide:

1. A list of all created files.
2. A list of all modified files.
3. Explanation of the architecture.
4. Required environment variables.
5. Backend API endpoint documentation.
6. Supported audio formats.
7. Supported Indian languages based on the actual selected provider.
8. Instructions for testing on Android.
9. Instructions for testing on iOS.
10. Any BharatGen credentials, API access, endpoint, or documentation still required from me.

## Most Important Requirement

The goal of this feature is:

```text
RECORD AUDIO
        ↓
AUTOMATICALLY DETECT INDIAN LANGUAGE
        ↓
CONVERT SPEECH TO TEXT
        ↓
KEEP THE TEXT IN THE ORIGINAL LANGUAGE
```

Do not implement automatic translation.

Do not implement an AI chatbot unless specifically requested later.

Focus primarily on accurate multilingual Indian Speech-to-Text conversion and automatic language detection.
