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
import { fieldSelector, fieldByName } from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import * as parser from './_tabularMCQParser.js';
import _TabularMCQ from './_TabularMCQ';

export const fields = state.fields(['value']);

const TabularMCQ = core({
  ...peggyParser(parser),
  ...blocks.input({
    getValue: (props, reduxState, id) => {
      const value = fieldSelector(reduxState, { ...props, id }, fieldByName('value'), { fallback: {} });
      return value;  // { rowId: colIndex } for radio, { rowId: [colIndex, ...] } for checkbox
    }
  }),
  name: 'TabularMCQ',
  description: 'Tabular multiple choice matrix',
  component: _TabularMCQ,
  fields,
  locals: {
    // Helper to get parsed data (peggyParser wraps in { type: 'parsed', parsed: {...} })
    _getParsed: (props) => props.kids?.parsed || props.kids || {},

    // Get full parsed config
    getConfig: (props) => props.kids?.parsed || props.kids,

    // Get rows array
    getRows: (props) => (props.kids?.parsed || props.kids)?.rows || [],

    // Get columns array
    getCols: (props) => (props.kids?.parsed || props.kids)?.cols || [],

    // Get mode ('radio' or 'checkbox')
    getMode: (props) => (props.kids?.parsed || props.kids)?.mode || 'radio',

    // Get expected answers for grading: { rowId: expectedColIndex }
    getAnswers: (props) => {
      const parsed = props.kids?.parsed || props.kids || {};
      const rows = parsed.rows || [];
      const cols = parsed.cols || [];
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
      const parsed = props.kids?.parsed || props.kids || {};
      const cols = parsed.cols || [];
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
      const value = fieldSelector(reduxState, { ...props, id }, fieldByName('value'), { fallback: {} });
      const parsed = props.kids?.parsed || props.kids || {};
      const cols = parsed.cols || [];
      let total = 0;
      Object.values(value).forEach(colIdx => {
        if (typeof colIdx === 'number' && cols[colIdx]?.value !== undefined) {
          total += cols[colIdx].value;
        } else if (Array.isArray(colIdx)) {
          // Checkbox mode - sum all selected values
          colIdx.forEach(idx => {
            if (cols[idx]?.value !== undefined) {
              total += cols[idx].value;
            }
          });
        }
      });
      return total;
    }
  }
});

export default TabularMCQ;
