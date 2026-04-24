// @vitest-environment node
//
// Content hash tests.

import { describe, it, expect } from 'vitest';
import { contentHash } from './hash';

describe('contentHash', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = contentHash('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same content gives same hash', () => {
    expect(contentHash('same content')).toBe(contentHash('same content'));
  });

  it('different content gives different hash', () => {
    expect(contentHash('content A')).not.toBe(contentHash('content B'));
  });

  it('matches known SHA-256 for empty string', () => {
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(contentHash('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('result is a string', () => {
    const hash = contentHash('test');
    expect(typeof hash).toBe('string');
  });
});
