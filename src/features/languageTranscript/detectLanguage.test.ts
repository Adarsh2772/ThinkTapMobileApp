import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectLanguageCodeFromText, detectSpeechLocaleFromText } from './detectLanguage.ts';
import { pickBestInstalledSpeechLocale, listInstalledVoiceLocales } from './locales.ts';
import type { LocaleAvailability } from './locales.ts';

describe('auto language detection', () => {
  it('detects script from transcript', () => {
    assert.equal(detectLanguageCodeFromText('नमस्कार'), null);
    assert.equal(detectLanguageCodeFromText('hello world'), 'en');
    assert.equal(detectLanguageCodeFromText('வணக்கம்'), 'ta');
  });

  it('maps Devanagari to mr-IN when recognizer was Marathi', () => {
    assert.equal(
      detectSpeechLocaleFromText('रेकॉर्डिंग सुरू करा', 'mr-IN'),
      'mr-IN',
    );
    assert.equal(
      detectSpeechLocaleFromText('रिकॉर्डिंग शुरू करो', 'hi-IN'),
      'hi-IN',
    );
  });

  it('picks best installed locale without user preference', () => {
    const availability: LocaleAvailability[] = [
      { code: 'mr-IN', available: false, installedOnDevice: false, supportedOnDevice: false, online: false },
      { code: 'hi-IN', available: true, installedOnDevice: true, supportedOnDevice: false, online: false },
      { code: 'en-IN', available: true, installedOnDevice: true, supportedOnDevice: false, online: false },
    ];
    assert.equal(pickBestInstalledSpeechLocale(availability), 'hi-IN');
  });

  it('lists multiple locales for voice-command rotation', () => {
    const availability: LocaleAvailability[] = [
      { code: 'mr-IN', available: true, installedOnDevice: true, supportedOnDevice: false, online: false },
      { code: 'en-IN', available: true, installedOnDevice: true, supportedOnDevice: false, online: false },
    ];
    const locales = listInstalledVoiceLocales(availability);
    assert.ok(locales.includes('mr-IN'));
    assert.ok(locales.includes('en-IN'));
  });
});
