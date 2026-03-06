// src/components/blocks/TextArea.js
import { z } from 'zod';
import { core } from '@/lib/blocks';
import * as state from '@/lib/state';
import { commonFields } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { baseAttributes, placeholder, z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import { selectBlock } from '@/lib/state/olxjson';
import { refToOlxKey } from '@/lib/blocks/idResolver';
import _TextArea from './_TextArea';
import type { RuntimeProps, OlxReference } from '@/lib/types';

export const fields = state.fields([commonFields.value, { name: 'readonly', schema: z_olx_boolean }]);
const TextArea = core({
  ...parsers.text.stripIndent(),
  name: 'TextArea',
  isInput: true,
  description: 'Multi-line text input field for longer student responses',
  component: _TextArea,
  fields: fields,
  attributes: baseAttributes.extend({
    ...placeholder,
    rows: z.string().default('4').describe('Number of visible text rows'),
    readonly: z_olx_boolean.optional().describe('Make textarea read-only'),
  }),
  // Read Redux value, falling back to initial text from OLX children
  selectValue: (props: RuntimeProps, reduxState: any, id: OlxReference) => {
    const reduxValue = state.fieldSelector(reduxState, { ...props, id }, commonFields.value, { fallback: undefined });
    if (reduxValue !== undefined) return reduxValue;

    // No Redux state yet — fall back to parsed children text
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const locale = props.runtime.locale.code;
    return (selectBlock(reduxState, sources, refToOlxKey(id), locale)!.kids as string).trim();
  },
});

export default TextArea;
