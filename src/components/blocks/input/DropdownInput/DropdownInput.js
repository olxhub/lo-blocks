// src/components/blocks/input/DropdownInput/DropdownInput.js
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { fieldSelector, fieldByName } from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import * as parser from './_dropdownParser.js';
import _DropdownSelect from './_DropdownSelect.jsx';

export const fields = state.fields(['value']);

const DropdownInput = core({
  ...peggyParser(parser),
  name: 'DropdownInput',
  description: 'Dropdown select input for choosing from a list of options',
  component: _DropdownSelect,
  fields,
  getValue: (props, state, id) => {
    return fieldSelector(state, { ...props, id }, fieldByName('value'), { fallback: '' });
  },
  locals: {
    getOptions: (props) => {
      const parsed = props.kids?.parsed;
      if (!parsed || !parsed.options) {
        return [];
      }
      return parsed.options;
    }
  }
});

export default DropdownInput;
