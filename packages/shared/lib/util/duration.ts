// packages/shared/lib/util/duration.ts
//
// Durations, in both directions:
//
//   parseDuration('1 hour 30 minutes')  →  5400     (authoring → seconds)
//   formatDuration(5400)                →  '1 hour 30 minutes'  (seconds → reading)
//
// These companion directions live together so their vocabulary stays in sync.
// Formatting deliberately omits small trailing units, so it is not a lossless
// inverse for every number of seconds.
//
// No React, no Redux, no zod — plain functions, usable from the server, from
// tests, from block components, and from the state language.
//
// TimedContainer uses formatting for its exact pre-start duration, while its
// live countdown retains its own deliberately rough TIME_BANDS display.
// TimeVisible and report screens use it for accumulated totals.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DURATION_UNITS: Record<string, number> = {
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  m: MINUTE, min: MINUTE, mins: MINUTE, minute: MINUTE, minutes: MINUTE,
  h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR,
  d: DAY, day: DAY, days: DAY,
};

/**
 * Parse a human-readable duration into seconds.
 *
 * Accepts "5 minutes", "3 hours", "1 hour 30 minutes", "2 days", "90s", or a
 * bare number (already seconds). Returns NaN for anything unrecognizable —
 * callers (notably `z_olx_duration`) turn that into a validation error.
 */
export function parseDuration(input: string | number): number {
  const s = String(input).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const pattern = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|sec|minutes?|mins?|min|hours?|hrs?|hr|days?|[smhd])\b/gi;
  let total = 0;
  let cursor = 0;
  for (const m of s.matchAll(pattern)) {
    if (s.slice(cursor, m.index).trim()) return NaN;
    const value = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (!(unit in DURATION_UNITS)) return NaN;
    total += value * DURATION_UNITS[unit];
    cursor = m.index! + m[0].length;
  }
  return cursor > 0 && !s.slice(cursor).trim() ? total : NaN;
}

/** `1` → `'1 minute'`, `n` → `'n minutes'`. */
function plural(n: number, unit: string): string {
  return n === 1 ? `1 ${unit}` : `${n} ${unit}s`;
}

/**
 * Humanize a number of seconds into words: "45 seconds", "5 minutes",
 * "1 hour 30 minutes", "2 days 3 hours".
 *
 * At most the two largest non-zero units appear — "1 hour 30 minutes", never
 * "1 hour 30 minutes 12 seconds". Below a minute we say seconds; a reader
 * comparing phases does not care about the tail.
 *
 * The second unit is truncated rather than rounded, which keeps the phrase
 * honest (never "1 hour 60 minutes") and monotonic.
 *
 * Missing, fractional, and negative inputs are tolerated: missing and
 * non-positive values read as "0 seconds", and fractional seconds are rounded.
 * Non-numeric values are programmer errors and throw rather than silently
 * becoming a plausible duration.
 *
 * TODO(i18n-duration): this consolidates the pre-existing English duration
 * vocabulary. Before using it for localized UI, give formatting an explicit
 * locale/translation context.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '0 seconds';
  if (!Number.isFinite(seconds)) {
    throw new TypeError(`formatDuration expects finite seconds, got ${seconds}`);
  }
  const total = Math.round(seconds);
  if (total <= 0) return '0 seconds';

  if (total >= DAY) {
    const days = Math.floor(total / DAY);
    const hours = Math.floor((total % DAY) / HOUR);
    return hours ? `${plural(days, 'day')} ${plural(hours, 'hour')}` : plural(days, 'day');
  }
  if (total >= HOUR) {
    const hours = Math.floor(total / HOUR);
    const mins = Math.floor((total % HOUR) / MINUTE);
    return mins ? `${plural(hours, 'hour')} ${plural(mins, 'minute')}` : plural(hours, 'hour');
  }
  if (total >= MINUTE) {
    const mins = Math.floor(total / MINUTE);
    const secs = total % MINUTE;
    return secs ? `${plural(mins, 'minute')} ${plural(secs, 'second')}` : plural(mins, 'minute');
  }
  return plural(total, 'second');
}
