// CopyFieldAction - copies a field value from one block to one or more others.
//
// Usage:
//   <CopyFieldAction target="source_input" output="dest_input" />
//   <CopyFieldAction target="grader.correct" output="display1.value,display2.value" />

import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import { z_blockFieldRef, z_blockFieldRefList } from '@/lib/blocks/attributeSchemas';
import { stateKeyForGlobalRef } from '@/lib/types/id-grammar';
import type { BlockFieldRef } from '@/lib/blocks/attributeSchemas';
import type { ObservableValue } from '@/lib/types';

async function copyFieldAction({ props }) {
  // OLX attributes are spread into props by propsFromNode
  const { target, output }: { target: BlockFieldRef, output: BlockFieldRef[] } = props;

  // Read the source's OBSERVABLE value (level 3): the source block's blueprint
  // getter when it has one, else the decoded store. For a field with a getter
  // — a TextArea's value, which falls back to its OLX kids — this copies what's
  // on screen, not the "" the raw store holds before the first edit.
  const targetStateKey = stateKeyForGlobalRef(target.ref, props.runtime.ns);
  const srcField = state.componentFieldByStateKey(props, targetStateKey, target.field);
  // Only an observable value may be copied — the brand enforces that this
  // payload came from a level-3 read, never from someone's backing store.
  const value: ObservableValue = state.getField(props, srcField, {
    stateKey: targetStateKey,
    fallback: '',
  });

  // Write to each output — field.write handles storage-specific dispatch
  // (e.g., docField computes splice deltas, plain field sets value directly)
  for (const dest of output) {
    const destStateKey = stateKeyForGlobalRef(dest.ref, props.runtime.ns);
    const destField = state.componentFieldByStateKey(props, destStateKey, dest.field);
    state.updateField(props, destField, value, { stateKey: destStateKey });
  }
}

const CopyFieldAction = blocks.dev({
  ...parsers.ignore(),
  ...blocks.action({
    action: copyFieldAction,
  }),
  name: 'CopyFieldAction',
  description: 'Copies a field value from one block to one or more others when triggered',
  // Shared no-op renderer lives in layout/, not a sibling of this file.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  attributes: z.object({
    target: z_blockFieldRef.describe('Source block.field to read from (default field: value)'),
    output: z_blockFieldRefList.describe('Destination block.field(s) to write to, comma-separated (default field: value)'),
  }).strict(),
});

export default CopyFieldAction;
