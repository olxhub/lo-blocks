// packages/shared/components/blocks/input/TextArea.ts
import { z } from 'zod';
import { core, input } from '@/lib/blocks';
import * as state from '@/lib/state';
import { docField } from '@/lib/state';
import * as parsers from '@/lib/content/parsers';
import { placeholder, z_olx_boolean } from '@/lib/blocks/attributeSchemas';
import { selectBlock } from '@/lib/state/olxjson';
import type { RuntimeProps, StateKey } from '@/lib/types';

export const fields = state.fields([docField('value'), { name: 'readonly', schema: z_olx_boolean }]);
const TextArea = core({
  ...parsers.text.stripIndent(),
  name: 'TextArea',
  ...input({ valueSchema: z.string() }),
  description: 'Multi-line text input field for longer student responses',
  fields: fields,
  attributes: z.object({
    ...placeholder,
    rows: z.string().default('4').describe('Number of visible text rows'),
    readonly: z_olx_boolean.optional().describe('Make textarea read-only'),
  }).strict(),
  // Read Redux value, falling back to initial text from OLX children
  selectors: {
    value: (reduxState: any, props: RuntimeProps, _stateKey: StateKey) => {
      // Self-read of the getter's backing field (level 2) — against the
      // PASSED state, like the kids fallback below: one evaluation, one
      // snapshot (getters are pure over the state they're handed).
      const value = state.decodedFieldSelector(reduxState, props, fields.value, { fallback: undefined });
      if (value !== undefined) {
        return value;
      }

      // No Redux state yet — fall back to parsed children text
      const sources = props.runtime.olxJsonSources ?? ['content'];
      const locale = props.runtime.locale.code;
      return (selectBlock(reduxState, sources, props.id, locale)!.kids as string).trim();
    },
  },
});

export default TextArea;
