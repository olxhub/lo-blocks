// packages/shared/lib/i18n/locale.test.ts
//
// The locale code a user ends up with is only as good as what the browser
// hands over, and `navigator.language` is not a trusted field: a browser
// launched with no locale configured reports the STRING "undefined". That
// string is truthy, survives `.split('-')[0].toLowerCase()` unchanged, and was
// stored as the user's locale — after which the language control read
// "undefined (undefined)" on every visit, because the label template names the
// code twice when Intl cannot resolve it.
//
// Three separate things had to be true for that to reach a user, so all three
// are pinned here: the entry point rejects a malformed code, the validator
// still accepts the unusual-but-valid tags translanguaging exists to support,
// and the label never renders a code it could not name as "X (X)".
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBrowserLocale, isValidLocaleCode, getTextDirection } from './getTextDirection';
import { getLanguageLabel } from './languages';

const setNavigatorLanguage = (language: unknown) => {
  vi.stubGlobal('navigator', { language });
};

describe('isValidLocaleCode', () => {
  it('accepts well-formed tags, including ones no list knows', () => {
    // Translanguaging takes free-text codes on purpose: the validator has to
    // test SHAPE, not membership, or it silently vetoes the whole feature.
    for (const code of ['en', 'fr', 'en-US', 'en-Latn-US', 'zh-Hans-CN', 'ar-Arab-SA', 'haw', 'yue-Hant-HK']) {
      expect(isValidLocaleCode(code), code).toBe(true);
    }
  });

  it('rejects the values that actually got stored', () => {
    // "undefined" is the one that shipped; the rest are the same class of
    // thing — free text from a search box, or a non-string entirely.
    for (const code of ['undefined', 'null', '', '   ', 'not a language', 'e', '-', 'en_US']) {
      expect(isValidLocaleCode(code), JSON.stringify(code)).toBe(false);
    }
    for (const code of [undefined, null, 42, {}, ['en']]) {
      expect(isValidLocaleCode(code), JSON.stringify(code)).toBe(false);
    }
  });
});

describe('getBrowserLocale', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes a real browser locale to its language subtag', () => {
    setNavigatorLanguage('en-US');
    expect(getBrowserLocale()).toBe('en');
    setNavigatorLanguage('fr-CA');
    expect(getBrowserLocale()).toBe('fr');
    setNavigatorLanguage('zh-Hans-CN');
    expect(getBrowserLocale()).toBe('zh');
  });

  it('falls back to English when the browser reports nonsense', () => {
    // The regression: a driver-launched browser with no locale set.
    setNavigatorLanguage('undefined');
    expect(getBrowserLocale()).toBe('en');

    for (const bogus of ['', null, undefined, 42]) {
      setNavigatorLanguage(bogus);
      expect(getBrowserLocale(), JSON.stringify(bogus)).toBe('en');
    }
  });

  it('never returns something it would itself reject', () => {
    // The property that matters: whatever comes out is storable. A fallback
    // that returned an invalid code would just move the bug downstream.
    for (const lang of ['en-US', 'undefined', '', 'not a language', null]) {
      setNavigatorLanguage(lang);
      expect(isValidLocaleCode(getBrowserLocale()), JSON.stringify(lang)).toBe(true);
    }
  });
});

describe('getLanguageLabel short form', () => {
  it('names real locales as before', () => {
    expect(getLanguageLabel('en', 'en', 'short')).toBe('English (en)');
    expect(getLanguageLabel('fr', 'en', 'short')).toBe('French (fr)');
  });

  it('shows a wholly unresolvable code once instead of twice', () => {
    // The shipped bug, exactly: not "undefined (undefined)". Intl can make
    // nothing of this code, so there is no name and no region to show, and the
    // code stands alone as the raw code it is.
    expect(getLanguageLabel('undefined', 'en', 'short')).toBe('undefined');
  });

  it('still splits a structurally valid tag Intl can only half-name', () => {
    // 'qqq-Zzzz-XX' has no display name but IS well-formed, so Intl echoes it
    // back canonicalized and the region is genuinely present. Splitting it is
    // right here — the guard above must not swallow this case too.
    expect(getLanguageLabel('qqq-Zzzz-XX', 'en', 'short')).toBe('qqq (XX)');
  });
});

describe('getTextDirection', () => {
  it('still reads direction off the language subtag', () => {
    // getBrowserLocale's fallback feeds this; a wrong answer here flips the
    // whole page.
    expect(getTextDirection('en')).toBe('ltr');
    expect(getTextDirection('ar')).toBe('rtl');
    expect(getTextDirection('he-IL')).toBe('rtl');
  });
});
