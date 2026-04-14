// src/components/blocks/TabularMCQ/TabularMCQ.js
//
// TabularMCQ - Matrix-style multiple choice for surveys, assessments, and personality tests.
//
// Supports:
// - Radio mode (one selection per row) - default
// - Checkbox mode (multiple selections per row)
// - Column values for scoring (e.g., Likert scales)
// - Row IDs for analytics/matrix scoring
// - Graded mode with expected answers
//
// Content is YAML with comma-split shorthand:
//   cols: Love, Like, Neutral        ← string split on commas (simple)
//   cols: [Love, Like, Neutral]      ← YAML array (explicit, handles commas in text)
//   cols:                             ← YAML block sequence (most explicit)
//     - text: "Love, actually"
//       value: 2
//
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import { yamlParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import _TabularMCQ from './_TabularMCQ';

// === Zod Schema ===
//
// Items flow through a uniform type: { text, id?, value?, answer? }
//
// Strings wrap to { text: s }, then suffix parsing extracts structured
// fields from the text. YAML objects already have those fields set, so
// suffix parsing is skipped.
//
//   "Agree|2"              → { text: "Agree|2" }     → { text: "Agree", id: "agree", value: 2 }
//   { text: "Agree", v: 2} → { text: "Agree", v: 2 } → { text: "Agree", id: "agree", value: 2 }

/** Convert text to a valid ID: lowercase, replace spaces with underscores */
function toId(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// --- Suffix parsers (pure functions, no regex) ---

/** "Agree|2" → ["Agree", "2"];  "Love" → ["Love", null] */
function splitPipeSuffix(s: string): [string, string | null] {
  const i = s.lastIndexOf('|');
  if (i < 0) return [s.trim(), null];
  return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

/** "Dog[Noun]" → ["Dog", "Noun"];  "Dog" → ["Dog", null] */
function splitBracketSuffix(s: string): [string, string | null] {
  if (s.endsWith(']')) {
    const i = s.lastIndexOf('[');
    if (i >= 0) return [s.slice(0, i).trim(), s.slice(i + 1, -1).trim()];
  }
  return [s.trim(), null];
}

// --- Item transforms ---

/**
 * Parse pipe suffix from text. Skips if id/value already set.
 *
 * The suffix is always the id. Numeric suffixes also set value (e.g. for Likert scoring).
 *   "Agree|2"         → { text: "Agree", id: "2", value: 2 }
 *   "Agree|agree_col" → { text: "Agree", id: "agree_col" }
 *   "Agree"           → { text: "Agree", id: "agree" }  (auto-derived)
 */
function parseColItem(item: { text: string; id?: string; value?: number }) {
  if (item.id !== undefined || item.value !== undefined) {
    return { text: item.text, id: item.id ?? toId(item.text), value: item.value };
  }
  const [text, suffix] = splitPipeSuffix(item.text);
  if (suffix !== null) {
    const num = parseFloat(suffix);
    if (!isNaN(num)) return { text, id: suffix, value: num };
    return { text, id: suffix };
  }
  return { text, id: toId(text) };
}

/**
 * Parse pipe (id) and bracket (answer) suffixes from text. Skips if already set.
 *
 * Bracket is extracted first so that "Label|id[answer]" splits correctly:
 * bracket gives ["Label|id", "answer"], then pipe gives ["Label", "id"].
 * This works because ']' cannot appear in a pipe suffix.
 */
function parseRowItem(item: { text: string; id?: string; answer?: string | null }) {
  if (item.id !== undefined || item.answer !== undefined) {
    return { text: item.text, id: item.id ?? toId(item.text), answer: item.answer ?? null };
  }
  const [afterBracket, answer] = splitBracketSuffix(item.text);
  const [text, id] = splitPipeSuffix(afterBracket);
  return { text, id: id ?? toId(text), answer };
}

// --- Zod schemas ---

/**
 * Idempotent comma-split: string → array, array → array.
 * YAML parses `cols: A, B, C` as a string but `cols: [A, B, C]` as an array.
 */
const commaList = z.union([
  z.string().transform(s => s.split(',').map(x => x.trim()).filter(Boolean)),
  z.array(z.any())
]);

/** Normalize string or object to { text, ...optional fields } */
const colInput = z.union([
  z.string().transform(s => ({ text: s.trim() })),
  z.object({ text: z.string(), id: z.string().optional(), value: z.number().optional() }),
]).transform(parseColItem);

const rowInput = z.union([
  z.string().transform(s => ({ text: s.trim() })),
  z.object({ text: z.string(), id: z.string().optional(), answer: z.string().nullable().optional() }),
]).transform(parseRowItem);

/** Match an answer string against column text or id */
function findColIndex(cols: { text: string; id: string }[], answer: string): number {
  return cols.findIndex(c => c.text === answer || c.id === answer);
}

const tabularMCQSchema = z.object({
  mode: z.enum(['radio', 'checkbox']).optional().default('radio'),
  cols: commaList.pipe(z.array(colInput)),
  rows: commaList.pipe(z.array(rowInput)),
}).superRefine((data, ctx) => {
  // Validate no empty IDs (e.g., from "Foo|" typo)
  data.cols.forEach((col, i) => {
    if (!col.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cols', i],
        message: `Column "${col.text}" has an empty id — remove the trailing "|" or provide an id`,
      });
    }
  });

  data.rows.forEach((row, i) => {
    if (!row.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', i],
        message: `Row "${row.text}" has an empty id — remove the trailing "|" or provide an id`,
      });
    }
    if (row.answer !== null && !row.answer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', i],
        message: `Row "${row.text}" has empty brackets "[]" — remove them or provide an answer`,
      });
    }
  });

  // Validate row IDs are unique
  const seenIds = new Set<string>();
  data.rows.forEach((row, i) => {
    if (seenIds.has(row.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rows', i],
        message: `Duplicate row id "${row.id}" — add explicit |id suffixes to disambiguate`,
      });
    }
    seenIds.add(row.id);
  });

  // Validate answers reference actual columns
  data.rows.forEach((row, i) => {
    if (!row.answer) return;
    const numAnswer = parseInt(row.answer, 10);
    if (!isNaN(numAnswer) && numAnswer >= 0 && numAnswer < data.cols.length) return;
    if (findColIndex(data.cols, row.answer) >= 0) return;
    const colNames = data.cols.map(c => c.text).join(', ');
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows', i],
      message: `Answer "${row.answer}" does not match any column. Available columns: ${colNames}`,
    });
  });
});

// === Block Definition ===

export const fields = state.fields([commonFields.value]);

const TabularMCQ = core({
  ...yamlParser(tabularMCQSchema),
  ...blocks.input({
    selectValue: (props, reduxState, _reduxKey) => {
      const value = fieldSelector(reduxState, props, fields.value, { fallback: {} });
      return value;  // { rowId: colIndex } for radio, { rowId: [colIndex, ...] } for checkbox
    }
  }),
  name: 'TabularMCQ',
  description: 'Tabular multiple choice matrix',
  component: _TabularMCQ,
  fields,
  attributes: srcAttributes.strict(),
  locals: {
    // yamlParser produces { type: 'parsed', parsed: {...} }
    // These accessors extract the parsed content for graders and other consumers.

    // Get full parsed config: { mode, cols, rows }
    getConfig: (props) => {
      const kids = props.kids;
      if (!kids || !kids.parsed) {
        throw new Error('TabularMCQ: Expected parsed content');
      }
      return kids.parsed;
    },

    // Get rows array
    getRows: (props) => {
      const parsed = props.kids.parsed;
      if (!parsed || !parsed.rows) {
        throw new Error('TabularMCQ: No rows defined. Add: rows: Item1, Item2, Item3');
      }
      return parsed.rows;
    },

    // Get columns array
    getCols: (props) => {
      const parsed = props.kids.parsed;
      if (!parsed || !parsed.cols) {
        throw new Error('TabularMCQ: No columns defined. Add: cols: Col1, Col2, Col3');
      }
      return parsed.cols;
    },

    // Get mode ('radio' or 'checkbox')
    getMode: (props) => props.kids.parsed.mode || 'radio',

    // Get expected answers for grading: { rowId: expectedColIndex }
    getAnswers: (props) => {
      const parsed = props.kids.parsed;
      const rows = parsed.rows;
      const cols = parsed.cols;
      const answers = {};
      rows.forEach(row => {
        if (row.answer !== null) {
          // Answer can be column index or label/id (exact match)
          let colIdx;
          const numAnswer = parseInt(row.answer, 10);
          if (!isNaN(numAnswer) && numAnswer >= 0 && numAnswer < cols.length) {
            colIdx = numAnswer;
          } else {
            colIdx = findColIndex(cols, row.answer);
          }
          if (colIdx >= 0) {
            answers[row.id] = colIdx;
          }
        }
      });
      return answers;
    },

    // Get column values for scoring: { colIndex: value }
    getColValues: (props) => {
      const cols = props.kids.parsed.cols;
      const values = {};
      cols.forEach((col, idx) => {
        if (col.value !== undefined) {
          values[idx] = col.value;
        }
      });
      return values;
    },

    // Calculate total score based on selections and column values
    getScore: (props, reduxState) => {
      const value = fieldSelector(reduxState, props, fields.value, { fallback: {} });
      const cols = props.kids.parsed.cols;
      let total = 0;
      Object.values(value).forEach(colIdx => {
        // colIdx comes from user selection - validate it exists
        if (typeof colIdx === 'number' && colIdx >= 0 && colIdx < cols.length) {
          const col = cols[colIdx];
          if (col.value !== undefined) {
            total += col.value;
          }
        } else if (Array.isArray(colIdx)) {
          // Checkbox mode - sum all selected values
          colIdx.forEach(idx => {
            if (idx >= 0 && idx < cols.length) {
              const col = cols[idx];
              if (col.value !== undefined) {
                total += col.value;
              }
            }
          });
        }
      });
      return total;
    }
  }
});

export default TabularMCQ;
