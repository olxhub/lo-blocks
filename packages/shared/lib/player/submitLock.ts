// packages/shared/lib/player/submitLock.ts
//
// "This work has been handed in": the one-way freeze a student applies to a
// whole activity when they submit it.
//
// The freeze is a single boolean on the nearest ancestor Sequential, set by an
// ordinary SetFieldAction on the submit button:
//
//   <ActionButton id="h1_print_btn" label="Submit here then save to PDF…"
//                 ignoreSubmitLock="true">
//     <SetFieldAction target="bmod_handout1" field="submitted" value="true" />
//     <PrintAction id="h1_print" />
//   </ActionButton>
//
// Why the ANCESTOR SEQUENTIAL rather than a flag per input: an author who has
// to list every field they want frozen will eventually add a twenty-fifth
// question and forget to list it, and the failure is silent — the handout looks
// submitted and one box stays editable. Hanging the flag on the activity means
// the set of frozen things is "everything in this activity", which cannot drift
// from the content. It also matches how the launchable activity already scopes
// other per-student facts (the LLM token budget, identity.ts:rateTokens).
//
// Scoped to the nearest ancestor rather than the namespace because a namespace
// holds a whole course: freezing `edu.memphis.psych` would freeze Handouts 2
// and 3 the moment a student submitted Handout 1.
//
// Consumers: useInputReadOnly (every input that already honours a read-only
// state) and ActionButton (which greys out, so a student cannot re-run the LLM
// feedback on work they have handed in). A button may opt out with
// ignoreSubmitLock="true" — the submit button itself must, or cancelling the
// print dialog would leave the student with no way to print again.
//
import { useFieldSelector, componentFieldByStateKey } from '@/lib/state';
import { value as valueFieldCommon } from '@/lib/state/commonFields';
import { inferRelatedNodes, getDomNodeByStateKey } from '@/lib/blocks/dynamicDom';
import { isAction } from '@/lib/blocks/actions';
import { scopedStateKeyForBlock } from '@/lib/types/id-grammar';
import type { FieldInfo, RuntimeProps, StateKey } from '@/lib/types';

/** The field an activity carries its submitted-ness in. Declared by Sequential. */
export const SUBMITTED_FIELD = 'submitted';

/**
 * Will pressing this button freeze the activity?
 *
 * Asked of the actions the button WILL ACTUALLY RUN — resolved with the same
 * call executeNodeActions uses, so the answer cannot drift from the behaviour
 * it describes. That matters more than it looks: the alternative is an
 * author-set "please confirm this one" attribute, and the whole point of a
 * confirmation here is that it is not optional. Freezing is irreversible from
 * the learner's side, so the warning has to be a property of the freeze, not
 * of whether someone remembered to ask for it.
 */
export function willFreeze(props: RuntimeProps): boolean {
  if (!props?.nodeInfo) return false;
  let actionKeys: StateKey[];
  try {
    actionKeys = inferRelatedNodes(props, {
      selector: n => isAction(n.loBlock),
      infer: (props as any).infer,
      targets: (props as any).target,
    });
  } catch {
    return false;   // Nothing resolvable to run — nothing to warn about.
  }
  return actionKeys.some(key => {
    const node = getDomNodeByStateKey(props, key);
    if (node?.loBlock?.name !== 'SetFieldAction') return false;
    const attrs = node.olxJson?.attributes as Record<string, unknown> | undefined;
    return attrs?.field === SUBMITTED_FIELD
      && (attrs?.value === 'true' || attrs?.value === true);
  });
}

/**
 * Hook: has the activity containing this component been submitted?
 *
 * Falls open (false) when there is no ancestor Sequential — a block previewed
 * on its own is not "submitted", it is just unattached.
 */
export function useSubmitLocked(props: RuntimeProps): boolean {
  // Not a hook, so the guard is free: preview and test renders can arrive
  // without a dynamic-DOM node, and inferRelatedNodes throws on those.
  let activityKey: StateKey | null = null;
  if (props?.nodeInfo) {
    const found = inferRelatedNodes(props, {
      selector: n => n.loBlock?.name === 'Sequential',
      infer: 'parents',
      closest: true,
    });
    activityKey = found[0] ?? null;
  }

  // Hook order has to be stable whether or not an activity was found, so read
  // SOMETHING either way: with no activity we read this block's own key through
  // the common `value` field and discard the answer below. Same shape as
  // _ChoiceItem's orphan fallback. componentFieldByStateKey THROWS on a block
  // that does not declare the field, so an older Sequential — or a content
  // bundle mid-reload — degrades to unlocked rather than blanking the screen.
  let field: FieldInfo = valueFieldCommon;
  if (activityKey) {
    try {
      field = componentFieldByStateKey(props, activityKey, SUBMITTED_FIELD);
    } catch {
      activityKey = null;
    }
  }
  const readKey = activityKey ?? scopedStateKeyForBlock(props);
  const raw = useFieldSelector(props, field, { stateKey: readKey, fallback: false });

  if (!activityKey) return false;
  return Boolean(raw);
}
