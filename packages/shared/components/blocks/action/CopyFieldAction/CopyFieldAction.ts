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
import _Noop from '@/components/blocks/layout/_Noop';
import type { BlockFieldRef } from '@/lib/blocks/attributeSchemas';

async function copyFieldAction({ targetInstance, props }) {
  const { target, output }: { target: BlockFieldRef, output: BlockFieldRef[] } = targetInstance.attributes;

  // Read from source — materialize via field.read (e.g., RgaDoc → string).
  //
  // TODO: This reads the source's raw Redux field. It does NOT consult
  // the source block's per-field "currently displayed value" — e.g., a
  // TextArea with starter text in its OLX kids visibly shows that text
  // but its value field is unset until the user edits, so we copy ""
  // instead of what's on screen. TextArea's selectValue knows about
  // this fallback, but selectValue is value-field-only and we can't
  // call it for arbitrary `target.field`.
  //
  // The right fix is a general per-field "current displayed value"
  // read protocol — the generalization of selectValue to arbitrary
  // fields. Once that lands, every action (this one, SetFieldAction,
  // LLMAction, …) and `<Ref>` see the same semantically-meaningful
  // value the renderer sees, and the per-block fallback semantics live
  // in one place. See parsers.ts textWithTargetParserMixin for the
  // matching note, and MermaidPublish.olx for the canonical bite.
  const targetStateKey = stateKeyForGlobalRef(target.ref);
  const srcField = state.componentFieldByStateKey(props, targetStateKey, target.field);
  const value = state.getField(props, srcField, {
    stateKey: targetStateKey,
    fallback: '',
  });

  // Write to each output — field.write handles storage-specific dispatch
  // (e.g., docField computes splice deltas, plain field sets value directly)
  for (const dest of output) {
    const destStateKey = stateKeyForGlobalRef(dest.ref);
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
  component: _Noop,
  attributes: z.object({
    target: z_blockFieldRef.describe('Source block.field to read from (default field: value)'),
    output: z_blockFieldRefList.describe('Destination block.field(s) to write to, comma-separated (default field: value)'),
  }).strict(),
});

export default CopyFieldAction;
