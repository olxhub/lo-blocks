// src/components/blocks/TextArea.js
import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { docField } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { placeholder, z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import { selectBlock } from '@/lib/state/olxjson';
import _TextArea from './_TextArea';
import type { RuntimeProps, StateKey } from '@/lib/types';

export const fields = state.fields([docField('value'), { name: 'readonly', schema: z_olx_boolean }]);
const TextArea = core({
  ...parsers.text.stripIndent(),
  name: 'TextArea',
  ...input({ valueSchema: z.string() }),
  description: 'Multi-line text input field for longer student responses',
  component: _TextArea,
  fields: fields,
  attributes: z.object({
    ...placeholder,
    rows: z.string().default('4').describe('Number of visible text rows'),
    readonly: z_olx_boolean.optional().describe('Make textarea read-only'),
  }).strict(),
  // Read Redux value, falling back to initial text from OLX children.
  //
  // Must read from the `reduxState` argument, NOT the global singleton store.
  // selectValue is invoked with an arbitrary state — e.g. a frozen replay store
  // when a <Ref> reads this TextArea during session replay. The previous
  // getField() call read the live singleton store instead, so any value
  // referenced through this TextArea came back empty in replay (the live store
  // is empty there). Select from the passed state and decode, mirroring how
  // other blocks' selectValue read state (e.g. SortableInput).
  selectValue: (props: RuntimeProps, reduxState: any, stateKey: StateKey) => {
    const raw = state.fieldSelector(reduxState, props, fields.value, { stateKey, fallback: undefined });
    const value = state.decodeField(fields.value, raw);
    if (value !== undefined) {
      return value;
    }

    // No Redux state yet — fall back to parsed children text
    const sources = props.runtime.olxJsonSources ?? ['content'];
    const locale = props.runtime.locale.code;
    return (selectBlock(reduxState, sources, props.id, locale)!.kids as string).trim();
  },
});

export default TextArea;
