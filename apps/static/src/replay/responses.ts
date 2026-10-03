// apps/static/src/replay/responses.ts
//
// Build-time helpers for the downloadable "Response Data" CSVs shown on the
// replay landing page. Two tables per run:
//
//   responses.csv  -- one row per student: identity + time-on-task summary +
//                     one column per graded response field (the free-text the
//                     student wrote and the AI feedback they got back).
//   sessions.csv   -- one row per work session: the time-on-task analytics
//                     table (start, duration, active time, events, pauses).
//
// The response values come from replaying each student's merged event stream
// through the REAL reducers to final state, then reading
// `state.component['CONTENT/<field>'].value`. Replaying (as opposed to reading
// the raw events) means we get exactly the value the student ended on, through
// the same reducer path the app uses.
//
// This module is Node-free except where noted; the CSV/formatting helpers and
// field extraction are pure and unit-tested. `replayResponses` pulls in the
// reducer stack (initReducers + replayToEvent) and is only called from the
// build script.
//
import type { AppState, LoggedEvent } from '@/lib/replay';
import type { StudentEntry } from './sessions';

// -----------------------------------------------------------------------------
// Response field list
// -----------------------------------------------------------------------------

/**
 * Default ordered response fields, from the pilots' `_HACK_grade_fields`
 * deploy config. Each maps to a component keyed `CONTENT/<field>`. Overridable
 * per run via the builder's `--fields` flag.
 */
export const DEFAULT_RESPONSE_FIELDS: readonly string[] = [
  'initial_suggestion',
  'initial_ai_suggestion',
  'ai_feedback',
  'email_draft',
  'ai_email_feedback',
  'explanation_not_for_6_year_old',
  'ai_not_for_6_year_old_feedback',
  'explanation_the_babysitter_can_implement',
  'ai_the_babysitter_can_implement_feedback',
];

// -----------------------------------------------------------------------------
// CSV encoding (RFC 4180)
// -----------------------------------------------------------------------------

/**
 * Escape one CSV field. Quotes the value when it contains a comma, double
 * quote, or any newline (CR/LF), doubling embedded quotes. null/undefined
 * become empty. Everything else is stringified. This is the whole of our CSV
 * correctness, so it is unit-tested against multi-line / quoted / comma text.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Join one row of already-raw (unescaped) cells into a CSV line. */
export function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(',');
}

/** Assemble a CSV document from a header row and data rows. CRLF line endings. */
export function csvDocument(header: string[], rows: unknown[][]): string {
  const lines = [csvRow(header), ...rows.map(csvRow)];
  return lines.join('\r\n') + '\r\n';
}

// -----------------------------------------------------------------------------
// Field extraction from replayed state
// -----------------------------------------------------------------------------

/**
 * Read a single response field's final text value out of replayed app state.
 * Values live at `state.component['CONTENT/<field>'].value`. Returns '' when
 * the component or its value is absent (student never reached that field), so
 * the column is present-but-empty rather than missing. Non-string values are
 * stringified defensively; the save_blob `component["undefined"]` artifact is
 * already stripped upstream (parseNDJSON drops save_blob from replayEvents).
 */
export function extractResponseField(state: AppState, field: string): string {
  const entry = state.component?.[`CONTENT/${field}`];
  if (entry == null) return '';
  const value = (entry as Record<string, unknown>).value;
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

/** Extract the full ordered field list from a replayed state. */
export function extractResponseFields(state: AppState, fields: readonly string[]): string[] {
  return fields.map((f) => extractResponseField(state, f));
}

// -----------------------------------------------------------------------------
// Row builders (pure — take already-replayed state)
// -----------------------------------------------------------------------------

export const RESPONSE_META_COLUMNS = [
  'user_id',
  'safe_user_id',
  'sessions',
  'total_active_min',
  'last_active',
] as const;

export const SESSION_COLUMNS = [
  'safe_user_id',
  'start',
  'duration_min',
  'active_min',
  'events',
  'pauses',
] as const;

/** Header row for responses.csv: fixed meta columns then one per field. */
export function responsesHeader(fields: readonly string[]): string[] {
  return [...RESPONSE_META_COLUMNS, ...fields];
}

function msToMin(ms: number): number {
  return Math.round(ms / 60000);
}

/** ISO date (YYYY-MM-DD) from an ISO timestamp, or '' if absent/unparseable. */
function isoDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** One responses.csv row for a student, given their replayed final state. */
export function responseRow(
  student: StudentEntry,
  state: AppState,
  fields: readonly string[],
): unknown[] {
  return [
    student.userId,
    student.safeUserId,
    student.sessions.length,
    msToMin(student.totalActiveMs),
    isoDate(student.lastActive),
    ...extractResponseFields(state, fields),
  ];
}

/** All sessions.csv rows for a student. */
export function sessionRows(student: StudentEntry): unknown[][] {
  return student.sessions.map((s) => [
    student.safeUserId,
    s.started ?? '',
    msToMin(s.durationMs),
    msToMin(s.activeMs),
    s.eventCount,
    s.gaps.length,
  ]);
}
