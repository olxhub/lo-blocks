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
import { core } from '@/lib/blocks';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import * as parser from './_tabularMCQParser';
import _TabularMCQ from './_TabularMCQ';

export const fields = state.fields([commonFields.value]);

const TabularMCQ = core({
  ...peggyParser(parser),
  ...blocks.input({
    getValue: (props, reduxState, id) => {
      const value = fieldSelector(reduxState, { ...props, id }, fields.value, { fallback: {} });
      return value;  // { rowId: colIndex } for radio, { rowId: [colIndex, ...] } for checkbox
    }
  }),
  name: 'TabularMCQ',
  description: 'Tabular multiple choice matrix',
  component: _TabularMCQ,
  fields,
  attributes: srcAttributes.strict(),
  locals: {
    // peggyParser always produces { type: 'parsed', parsed: {...} }
    // These accessors extract the parsed content for graders and other consumers.

    // Get full parsed config: { mode, cols, rows }
    getConfig: (props) => {
      const kids = props.kids;
      if (!kids || !kids.parsed) {
        throw new Error('TabularMCQ: Expected parsed content from peggyParser');
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
          // Answer can be column label/id or index
          let colIdx;
          const numAnswer = parseInt(row.answer, 10);
          if (!isNaN(numAnswer) && numAnswer >= 0 && numAnswer < cols.length) {
            colIdx = numAnswer;
          } else {
            // Find by text or id
            colIdx = cols.findIndex(c => c.text === row.answer || c.id === row.answer);
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
    getScore: (props, reduxState, id) => {
      const value = fieldSelector(reduxState, { ...props, id }, fields.value, { fallback: {} });
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
