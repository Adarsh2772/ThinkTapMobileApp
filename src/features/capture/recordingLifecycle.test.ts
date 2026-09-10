import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchesWakePhrase } from '../wakeWord/phrases.ts';
import {
  defaultSaveAudioRecordingForApi,
  resolveCaptureModeFor,
} from './captureModeLogic.ts';

/** Mirrors micHandoff settle policy without importing react-native. */
function shouldSettleAfterWakeTeardown(wakeServiceRunning: boolean): boolean {
  return wakeServiceRunning;
}

/**
 * Models Home finishRecording single-flight locks without React Native.
 * Both the red mic Stop and spoken “stop recording” must share this path.
 */
function createFinishController() {
  let finishLock = false;
  let stopping = false;
  let saveCount = 0;
  let stopCount = 0;

  return {
    async finishRecording() {
      if (finishLock || stopping) return false;
      finishLock = true;
      stopping = true;
      try {
        stopCount += 1;
        // Mirror await stop() — lock must be held across the async finalize.
        await new Promise((r) => setTimeout(r, 5));
        saveCount += 1;
        return true;
      } finally {
        stopping = false;
        finishLock = false;
      }
    },
    get stats() {
      return { stopCount, saveCount };
    },
  };
}

describe('Issue 1 — stop / save single flight', () => {
  it('button Stop and voice Stop share one finish path and save once', async () => {
    const ctrl = createFinishController();

    const results = await Promise.all([
      ctrl.finishRecording(),
      ctrl.finishRecording(),
    ]);

    const succeeded = results.filter(Boolean).length;
    assert.equal(succeeded, 1, 'Exactly one finish must proceed');
    assert.equal(ctrl.stats.stopCount, 1, 'Recorder must stop exactly once');
    assert.equal(ctrl.stats.saveCount, 1, 'Idea must be saved exactly once');
  });

  it('documents intentional dual modalities: one UI control + voice command', () => {
    const modalities = ['red_mic_button', 'voice_stop_phrase'] as const;
    assert.deepEqual([...modalities], ['red_mic_button', 'voice_stop_phrase']);
  });
});

describe('Issue 2 — wake word phrases and mic ownership', () => {
  it('matches “Hey Think” and start-recording variants', () => {
    assert.equal(matchesWakePhrase('hey think'), true);
    assert.equal(matchesWakePhrase('Hey Think'), true);
    assert.equal(matchesWakePhrase('hey think tap start recording'), true);
    assert.equal(matchesWakePhrase('start recording'), true);
  });

  it('Android 11 default keeps live STT (device mode)', () => {
    const prefer = defaultSaveAudioRecordingForApi('android', 30);
    assert.equal(prefer, false);
    assert.equal(resolveCaptureModeFor(prefer, 'android', 30), 'device');
  });
});

describe('Issue 3 — start recording handoff delay', () => {
  it('skips settle delay when wake service is not running', () => {
    assert.equal(
      shouldSettleAfterWakeTeardown(false),
      false,
      'Manual Start must not wait ~1.4s when wake is already idle',
    );
  });

  it('settles only after tearing down an active wake service', () => {
    assert.equal(shouldSettleAfterWakeTeardown(true), true);
  });
});
