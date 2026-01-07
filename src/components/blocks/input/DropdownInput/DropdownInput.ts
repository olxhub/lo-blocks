// src/components/blocks/input/DropdownInput/DropdownInput.js
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, commonFields } from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import * as parser from './_dropdownParser';
import _DropdownSelect from './_DropdownSelect';
import type { RuntimeProps } from '@/lib/types';

export const fields = state.fields([commonFields.value]);

const DropdownInput = core({
  ...peggyParser(parser),
  name: 'DropdownInput',
  description: 'Dropdown select input for choosing from a list of options',
  component: _DropdownSelect,
  fields,
  getValue: (props: RuntimeProps, state, id) => {
    return fieldSelector(state, { ...props, id }, fields.value, { fallback: '' });
  },
  attributes: srcAttributes.extend({
    placeholder: z.string().optional().describe('Placeholder text for empty selection'),
    options: z.string().optional().describe('Comma-separated options (e.g., "Red, Green, Blue" or "Red|r, Green|g")'),
  }),
  locals: {
    getOptions: (props) => {
      const parsed = props.kids?.parsed;
      if (!parsed || !parsed.options) {
        return [];
      }
      return parsed.options;
    },
    // Compatible with KeyGrader - returns { id, tag, value } for each option
    getChoices: (props) => {
      const parsed = props.kids?.parsed;
      if (!parsed || !parsed.options) {
        return [];
      }
      return parsed.options.map((opt, idx) => ({
        id: `${props.id}_opt_${idx}`,
        tag: opt.tag || null,  // 'Key', 'Distractor', or null
        value: opt.value
      }));
    }
  }
});

export default DropdownInput;
