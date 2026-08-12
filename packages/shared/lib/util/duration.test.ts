import { describe, it, expect } from 'vitest';
import { parseDuration, formatDuration } from './duration';

describe('parseDuration', () => {
  it('reads bare numbers as seconds', () => {
    expect(parseDuration(300)).toBe(300);
    expect(parseDuration('300')).toBe(300);
    expect(parseDuration('1.5')).toBe(1.5);
  });

  it('reads units and combinations', () => {
    expect(parseDuration('5 minutes')).toBe(300);
    expect(parseDuration('1 hour 30 minutes')).toBe(5400);
    expect(parseDuration('2 days')).toBe(172800);
    expect(parseDuration('90s')).toBe(90);
  });

  it('returns NaN for nonsense', () => {
    expect(parseDuration('soon')).toBeNaN();
    expect(parseDuration('')).toBeNaN();
    expect(parseDuration('5 minutes eventually')).toBeNaN();
    expect(parseDuration('about 5 minutes')).toBeNaN();
  });
});

describe('formatDuration', () => {
  it('speaks seconds, minutes, hours, days', () => {
    expect(formatDuration(1)).toBe('1 second');
    expect(formatDuration(45)).toBe('45 seconds');
    expect(formatDuration(60)).toBe('1 minute');
    expect(formatDuration(300)).toBe('5 minutes');
    expect(formatDuration(3600)).toBe('1 hour');
    expect(formatDuration(86400)).toBe('1 day');
  });

  it('adds at most one secondary unit', () => {
    expect(formatDuration(65)).toBe('1 minute 5 seconds');
    expect(formatDuration(5400)).toBe('1 hour 30 minutes');
    expect(formatDuration(5401)).toBe('1 hour 30 minutes');   // no trailing seconds
    expect(formatDuration(97200)).toBe('1 day 3 hours');
  });

  it('never rounds a secondary unit up into the next one', () => {
    // Rounding the minutes of 3599s would read "1 hour 60 minutes".
    expect(formatDuration(3570)).toBe('59 minutes 30 seconds');
    expect(formatDuration(3599)).toBe('59 minutes 59 seconds');
    expect(formatDuration(86399)).toBe('23 hours 59 minutes');
  });

  it('handles missing and non-positive values, but rejects invalid numbers', () => {
    expect(formatDuration(undefined)).toBe('0 seconds');
    expect(formatDuration(null)).toBe('0 seconds');
    expect(formatDuration(0)).toBe('0 seconds');
    expect(formatDuration(-5)).toBe('0 seconds');
    expect(formatDuration(0.4)).toBe('0 seconds');
    expect(() => formatDuration(NaN)).toThrow('expects finite seconds');
    expect(() => formatDuration(Infinity)).toThrow('expects finite seconds');
  });

  it('round-trips with parseDuration for the phrases it emits', () => {
    for (const seconds of [1, 45, 60, 65, 300, 3600, 5400, 86400, 97200]) {
      expect(parseDuration(formatDuration(seconds))).toBe(seconds);
    }
  });
});
