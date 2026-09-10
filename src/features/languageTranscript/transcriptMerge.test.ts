import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  flushInterimToFinals,
  mergeTranscriptSegment,
} from './transcriptMerge.ts';

describe('transcript merge', () => {
  it('preserves longer interim when a shorter final arrives', () => {
    const next = mergeTranscriptSegment(
      { finals: [], interim: 'hello world' },
      'hello',
      true,
    );
    assert.equal(next.finals.join(' '), 'hello world');
    assert.equal(next.interim, '');
  });

  it('appends speech after a natural pause / session restart', () => {
    let buf = mergeTranscriptSegment({ finals: [], interim: '' }, 'This is the first part', true);
    buf = mergeTranscriptSegment(buf, 'and this is the second part', true);
    assert.equal(
      buf.finals.join(' '),
      'This is the first part and this is the second part',
    );
  });

  it('keeps committed text when a new partial does not include the prefix', () => {
    const buf = mergeTranscriptSegment(
      { finals: ['This is the first part'], interim: '' },
      'and this is the second part',
      false,
    );
    assert.equal(buf.interim, 'and this is the second part');
    assert.equal(buf.finals.join(' '), 'This is the first part');
  });

  it('flushes interim on session end', () => {
    const buf = flushInterimToFinals({ finals: [], interim: 'unfinished tail' });
    assert.equal(buf.finals.join(' '), 'unfinished tail');
    assert.equal(buf.interim, '');
  });

  it('does not duplicate identical finals', () => {
    const buf = mergeTranscriptSegment(
      { finals: ['hello world'], interim: '' },
      'hello world',
      true,
    );
    assert.equal(buf.finals.join(' '), 'hello world');
  });
});
