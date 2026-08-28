import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  matchesResumePhrase,
  matchesStopPhrase,
  matchesWakePhrase,
  normalizeSpeech,
  voicePhraseCatalog,
} from './phrases.ts';

describe('wake phrase matching (language-independent)', () => {
  it('matches English start commands', () => {
    assert.equal(matchesWakePhrase('start recording'), true);
    assert.equal(matchesWakePhrase('hey think tap'), true);
  });

  it('matches Marathi Devanagari start commands', () => {
    assert.equal(matchesWakePhrase('रेकॉर्डिंग सुरू करा'), true);
    assert.equal(matchesWakePhrase('सुरू करा'), true);
  });

  it('matches romanized Marathi when STT uses English locale', () => {
    assert.equal(matchesWakePhrase('recording suru kara'), true);
    assert.equal(matchesWakePhrase('rekording suru kara'), true);
    assert.equal(matchesWakePhrase('suru kara'), true);
  });

  it('matches Tamil start commands', () => {
    assert.equal(matchesWakePhrase('ரெக்கார்டிங் தொடங்கு'), true);
    assert.equal(matchesWakePhrase('தொடங்கு'), true);
    assert.equal(matchesResumePhrase('பதிவு தொடங்கு'), true);
  });

  it('matches Telugu start commands', () => {
    assert.equal(matchesWakePhrase('రికార్డింగ్ ప్రారంభించు'), true);
    assert.equal(matchesWakePhrase('ప్రారంభించు'), true);
  });

  it('matches Bengali start commands', () => {
    assert.equal(matchesWakePhrase('রেকর্ডিং শুরু করুন'), true);
    assert.equal(matchesWakePhrase('শুরু করো'), true);
  });

  it('matches Gujarati, Kannada, Malayalam start commands', () => {
    assert.equal(matchesWakePhrase('રેકોર્ડિંગ શરૂ કરો'), true);
    assert.equal(matchesWakePhrase('ರೆಕಾರ್ಡಿಂಗ್ ಪ್ರಾರಂಭಿಸಿ'), true);
    assert.equal(matchesWakePhrase('റെക്കോർഡിംഗ് ആരംഭിക്കുക'), true);
  });

  it('matches Punjabi, Odia, Assamese, Urdu start commands', () => {
    assert.equal(matchesWakePhrase('ਰਿਕਾਰਡਿੰਗ ਸ਼ੁਰੂ ਕਰੋ'), true);
    assert.equal(matchesWakePhrase('ରେକର୍ଡିଂ ଆରମ୍ଭ କରନ୍ତୁ'), true);
    assert.equal(matchesWakePhrase('ৰেকৰ্ডিং আৰম্ভ কৰক'), true);
    assert.equal(matchesWakePhrase('ریکارڈنگ شروع کریں'), true);
  });

  it('matches stop commands in Indian languages', () => {
    assert.equal(matchesStopPhrase('थांबा'), true);
    assert.equal(matchesStopPhrase('ரெக்கார்டிங் நிறுத்து'), true);
    assert.equal(matchesStopPhrase('రికార్డింగ్ ఆపు'), true);
    assert.equal(matchesStopPhrase('রেকর্ডিং বন্ধ করুন'), true);
    assert.equal(matchesStopPhrase('റെക്കോർഡിംഗ് നിർത്തുക'), true);
    assert.equal(matchesStopPhrase('ریکارڈنگ بند کریں'), true);
    assert.equal(matchesStopPhrase('stop recording'), true);
  });

  it('does not false-trigger stop inside a sentence', () => {
    assert.equal(matchesStopPhrase('we should stop doing that'), false);
    assert.equal(matchesStopPhrase('थांबा'), true);
  });

  it('normalizeSpeech keeps Indic and Arabic scripts', () => {
    assert.equal(normalizeSpeech('  रेकॉर्डिंग सुरू करा  '), 'रेकॉर्डिंग सुरू करा');
    assert.equal(normalizeSpeech('  ரெக்கார்டிங் தொடங்கு  '), 'ரெக்கார்டிங் தொடங்கு');
    assert.equal(normalizeSpeech('  ریکارڈنگ شروع کریں  '), 'ریکارڈنگ شروع کریں');
  });

  it('includes all 13 Indian language start phrases', () => {
    assert.ok(voicePhraseCatalog.indianStart.length >= 40);
  });
});
