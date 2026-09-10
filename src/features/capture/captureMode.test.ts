import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  defaultSaveAudioRecordingForApi,
  resolveCaptureModeFor,
  supportsAudioWithLiveTranscriptForApi,
} from './captureModeLogic.ts';
import {
  flushInterimToFinals,
  mergeTranscriptSegment,
  normalizeTranscriptText,
  type TranscriptBuffer,
} from '../languageTranscript/transcriptMerge.ts';

describe('capture mode — Android 11 vs Android 15', () => {
  it('Android 15 (API 35) always uses device mode with live transcript', () => {
    assert.equal(supportsAudioWithLiveTranscriptForApi('android', 35), true);
    assert.equal(resolveCaptureModeFor(true, 'android', 35), 'device');
    assert.equal(resolveCaptureModeFor(false, 'android', 35), 'device');
  });

  it('Android 11 (API 30) disables live STT when save-audio is preferred', () => {
    assert.equal(supportsAudioWithLiveTranscriptForApi('android', 30), false);
    assert.equal(
      resolveCaptureModeFor(true, 'android', 30),
      'audio-file',
      'OPPO A51 bug path: save-audio ON → no live text while recording',
    );
  });

  it('Android 11 uses device mode (live STT) when save-audio is off', () => {
    assert.equal(
      resolveCaptureModeFor(false, 'android', 30),
      'device',
      'Live transcription must be available on Android 11 when save-audio is off',
    );
  });

  it('defaults save-audio OFF on Android 11 so live text works out of the box', () => {
    assert.equal(
      defaultSaveAudioRecordingForApi('android', 30),
      false,
      'Default must prefer live STT on API < 33',
    );
    assert.equal(
      resolveCaptureModeFor(defaultSaveAudioRecordingForApi('android', 30), 'android', 30),
      'device',
    );
  });

  it('defaults save-audio ON for API 33+ is harmless (capture stays device)', () => {
    const prefer = defaultSaveAudioRecordingForApi('android', 33);
    assert.equal(prefer, true);
    assert.equal(resolveCaptureModeFor(prefer, 'android', 33), 'device');
  });
});

describe('live transcription pipeline while recording (Android 11 device mode)', () => {
  type Session = {
    recording: boolean;
    liveSttEnabled: boolean;
    buffer: TranscriptBuffer;
    liveUiUpdates: string[];
  };

  function display(buffer: TranscriptBuffer): string {
    return normalizeTranscriptText(
      [buffer.finals.join(' '), buffer.interim].filter(Boolean).join(' '),
    );
  }

  function startRecording(apiLevel: number, preferSavedAudio: boolean): Session {
    const mode = resolveCaptureModeFor(preferSavedAudio, 'android', apiLevel);
    return {
      recording: true,
      liveSttEnabled: mode === 'device',
      buffer: { finals: [], interim: '' },
      liveUiUpdates: [],
    };
  }

  function onSpeechResult(session: Session, text: string, isFinal: boolean): string {
    assert.equal(session.recording, true, 'Speech results arrive while recording');
    assert.equal(
      session.liveSttEnabled,
      true,
      'Live STT must be enabled for translation/transcription updates during recording',
    );
    session.buffer = mergeTranscriptSegment(session.buffer, text, isFinal);
    const live = display(session.buffer);
    session.liveUiUpdates.push(live);
    return live;
  }

  function stopRecording(session: Session): string {
    session.buffer = flushInterimToFinals(session.buffer);
    session.recording = false;
    return display(session.buffer);
  }

  it('Android 11 default: live text updates BEFORE recording stops', () => {
    const prefer = defaultSaveAudioRecordingForApi('android', 30);
    const session = startRecording(30, prefer);
    assert.equal(session.liveSttEnabled, true);

    // Simulate: source English spoken → live transcript (product keeps spoken language).
    let live = onSpeechResult(session, 'Hello how are you', false);
    assert.match(live, /Hello how are you/i);
    assert.equal(session.recording, true, 'Recording still active during first update');

    live = onSpeechResult(session, 'Hello how are you', true);
    assert.equal(session.recording, true);
    assert.ok(session.liveUiUpdates.length >= 2);

    live = onSpeechResult(session, 'I am going to the market', true);
    assert.equal(
      normalizeTranscriptText(live),
      'Hello how are you I am going to the market',
    );
    assert.equal(session.recording, true, 'Second update must happen before stop');

    const finalText = stopRecording(session);
    assert.equal(finalText, 'Hello how are you I am going to the market');
    assert.equal(session.recording, false);
  });

  it('Android 11 with save-audio ON: no live pipeline (documents the old bug)', () => {
    const session = startRecording(30, true);
    assert.equal(session.liveSttEnabled, false);
    assert.equal(session.recording, true);
    // UI would show recording indicator but never receive STT events.
    assert.equal(session.liveUiUpdates.length, 0);
  });

  it('Android 15: live pipeline works even if save-audio preference is true', () => {
    const session = startRecording(35, true);
    assert.equal(session.liveSttEnabled, true);
    onSpeechResult(session, 'Hello how are you', true);
    assert.equal(session.recording, true);
    assert.ok(session.liveUiUpdates.length > 0);
    stopRecording(session);
  });
});
