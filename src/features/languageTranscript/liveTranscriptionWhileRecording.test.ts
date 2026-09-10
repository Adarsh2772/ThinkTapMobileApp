import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  flushInterimToFinals,
  mergeTranscriptSegment,
  normalizeTranscriptText,
  type TranscriptBuffer,
} from './transcriptMerge.ts';

/**
 * Deterministic stand-in for the live-transcription path used while recording
 * (`useLanguageTranscript` → `liveTranscript` on Home).
 *
 * Product note: ThinkTap shows live *transcription* in the spoken language.
 * It does NOT offer source→target live translation (e.g. English → Hindi).
 * This suite automates the closest real behavior: progressive transcript updates
 * while a capture session is still active.
 */
type CaptureSession = {
  recording: boolean;
  buffer: TranscriptBuffer;
  liveUpdatesWhileRecording: string[];
};

function displayText(buffer: TranscriptBuffer): string {
  return normalizeTranscriptText(
    [buffer.finals.join(' '), buffer.interim].filter(Boolean).join(' '),
  );
}

function startSession(): CaptureSession {
  return {
    recording: true,
    buffer: { finals: [], interim: '' },
    liveUpdatesWhileRecording: [],
  };
}

/** Apply a mocked speech-recognition result while recording is still active. */
function applySpeechResult(
  session: CaptureSession,
  transcript: string,
  isFinal: boolean,
): string {
  assert.equal(
    session.recording,
    true,
    'Speech results must be applied while recording is still active',
  );
  session.buffer = mergeTranscriptSegment(session.buffer, transcript, isFinal);
  const live = displayText(session.buffer);
  session.liveUpdatesWhileRecording.push(live);
  return live;
}

function stopSession(session: CaptureSession): string {
  assert.equal(session.recording, true, 'Expected an active recording to stop');
  session.buffer = flushInterimToFinals(session.buffer);
  session.recording = false;
  return displayText(session.buffer);
}

describe('live transcription while recording (closest to live-translation QA case)', () => {
  it('updates the live transcript progressively before recording stops', () => {
    const session = startSession();

    // Speak: "Hello, how are you today?"
    let live = applySpeechResult(session, 'Hello', false);
    assert.match(live, /Hello/i, 'Interim text should appear while still recording');
    assert.equal(session.recording, true, 'Recording must stay active during interim updates');

    live = applySpeechResult(session, 'Hello how are you today', false);
    assert.match(
      live,
      /Hello how are you today/i,
      'Interim should grow as more words are recognized',
    );
    assert.equal(session.recording, true);

    live = applySpeechResult(session, 'Hello how are you today', true);
    assert.match(
      live,
      /Hello how are you today/i,
      'Final chunk for sentence 1 must be visible before Stop',
    );
    assert.equal(
      session.liveUpdatesWhileRecording.length >= 3,
      true,
      'Expected multiple live updates before stop',
    );

    // Continue speaking while still recording: "I am going to the market."
    live = applySpeechResult(session, 'I am going to the market', false);
    assert.match(live, /Hello how are you today/i, 'Prior speech must remain visible');
    assert.match(live, /I am going to the market/i, 'New speech must appear before stop');
    assert.equal(session.recording, true);

    live = applySpeechResult(session, 'I am going to the market', true);
    assert.equal(
      normalizeTranscriptText(live),
      'Hello how are you today I am going to the market',
      'Both sentences must be present in the live transcript before stop',
    );

    const finalText = stopSession(session);
    assert.equal(
      finalText,
      'Hello how are you today I am going to the market',
      'Final transcript after stop must match spoken content',
    );
    assert.equal(session.recording, false);
  });

  it('preserves earlier content across a short pause / recognizer restart', () => {
    const session = startSession();

    applySpeechResult(session, 'This is the first sentence', true);
    // Natural pause → engine ends session and restarts (new partial without prefix).
    applySpeechResult(session, 'This is the second sentence', false);
    applySpeechResult(session, 'This is the second sentence', true);
    applySpeechResult(session, 'This is the third sentence', true);

    const finalText = stopSession(session);
    assert.equal(
      finalText,
      'This is the first sentence This is the second sentence This is the third sentence',
      'Pauses must not wipe previously committed speech',
    );
  });

  it('handles silence (empty results) without clearing prior transcript', () => {
    const session = startSession();
    applySpeechResult(session, 'Hello how are you today', true);

    const beforeSilence = displayText(session.buffer);
    // Empty / whitespace recognition events are ignored by the merge helper.
    session.buffer = mergeTranscriptSegment(session.buffer, '   ', false);
    session.buffer = mergeTranscriptSegment(session.buffer, '', true);

    assert.equal(
      displayText(session.buffer),
      beforeSilence,
      'Silence must not erase the live transcript',
    );
    assert.equal(session.recording, true);
  });

  it('keeps a stable transcript when stopping immediately after start with no speech', () => {
    const session = startSession();
    const finalText = stopSession(session);
    assert.equal(finalText, '', 'Immediate stop with no speech yields an empty transcript');
    assert.equal(session.recording, false);
  });

  it('supports multiple start/stop recording sessions without leaking text', () => {
    const first = startSession();
    applySpeechResult(first, 'First take only', true);
    const firstFinal = stopSession(first);
    assert.equal(firstFinal, 'First take only');

    const second = startSession();
    assert.equal(
      displayText(second.buffer),
      '',
      'A new recording session must start with an empty transcript buffer',
    );
    applySpeechResult(second, 'Second take only', true);
    const secondFinal = stopSession(second);
    assert.equal(secondFinal, 'Second take only');
    assert.notEqual(secondFinal, firstFinal);
  });

  it('does not let a shorter late final overwrite a longer interim (engine quirk)', () => {
    const session = startSession();
    applySpeechResult(session, 'I am going to the market', false);
    applySpeechResult(session, 'I am going', true);

    assert.equal(
      displayText(session.buffer),
      'I am going to the market',
      'Shorter final must not destroy a longer interim while recording',
    );
  });

  it('documents that live source→target translation is not a product feature', () => {
    // ThinkTap keeps text in the spoken language (live transcription).
    // There is no English→Hindi live translation pipeline to automate.
    const session = startSession();
    applySpeechResult(session, 'Hello how are you today', true);
    const live = displayText(session.buffer);

    assert.match(live, /Hello how are you today/i);
    assert.doesNotMatch(
      live,
      /नमस्ते|आप कैसे हो/,
      'Live UI text is transcription, not Hindi translation of English speech',
    );
  });
});
