// packages/shared/components/blocks/input/ChoiceInput/choiceHelpers.ts
//
// Shared choice discovery for ChoiceInput (radio) and CheckboxInput.
//
// Fully static (kids structure + target= refs via the static DOM): this
// local is called by graders through inputApi, so it runs everywhere
// grading runs — selectors, node, analytics — where there is no dynamic
// (rendered) DOM.
//
import { getBlockByDefinitionRef } from '@/lib/blocks';
import { parseAnyStateRef, stateKeyForGlobalRef, leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import { isKidArray } from '@/lib/types/kids';
import { defaultCodeForValue } from './defaultCodes';
import type { DefinitionKey, RuntimeProps, StateRef } from '@/lib/types';

export interface Choice {
  tag: string;
  value: string;
  /** The option's numeric CODE (survey sense — never a score; see
   *  defaultCodes.ts): the explicit `code=` when the author wrote one, else
   *  the effective default for its value — negated when the item is
   *  `reverseCoded` — else undefined. */
  code: number | undefined;
}

const isChoiceTag = (tag: string) => tag === 'Key' || tag === 'Distractor';

/** Recursively collect Key/Distractor DefinitionKeys from a kids structure
 *  (choices may sit inside wrapper markup). */
function choiceKeysFromKids(props: RuntimeProps, kids: any): DefinitionKey[] {
  if (!isKidArray(kids)) return [];
  return kids.flatMap(k => {
    if (k.type === 'html') return choiceKeysFromKids(props, k.kids);
    if (k.type !== 'block') return [];
    const definitionKey = k.definitionKey;
    const inst = getBlockByDefinitionRef(props, definitionKey);
    if (!inst) return [];
    if (isChoiceTag(inst.tag)) return [definitionKey];
    return choiceKeysFromKids(props, inst.kids);
  });
}

export function getChoices(props: RuntimeProps, _state: unknown, _id: unknown): Choice[] {
  // Explicit target= refs (choices not nested as kids), else the kids walk.
  // Authored refs are StateRefs by grammar — a scoped ref ("list:#0:choiceA")
  // is legal — so parse them as such and take the LEAF definition; choices
  // are definitions (tag + value), never instances.
  const targetRefs: StateRef[] = props.target
    ? (Array.isArray(props.target) ? props.target : String(props.target).split(','))
      .map((t: string) => t.trim()).filter(Boolean).map(parseAnyStateRef)
    : [];
  const choiceDefinitionKeys = targetRefs.length > 0
    ? targetRefs.map(ref => leafDefinitionKeyFromStateKey(
        stateKeyForGlobalRef(ref, props.runtime.ns)))
    : choiceKeysFromKids(props, props.kids);

  // A reverse-coded item (the psychometric term) negates the default table
  // for its own options: agreeing with "Either you are a writer or you are
  // not" is the negative pole. Declared once here on the item rather than
  // option by option, and resolved in this one place so every consumer of a
  // Choice — the code/codes selectors, graders, analytics — agrees.
  const reverseCoded = props.reverseCoded === true;

  return choiceDefinitionKeys.flatMap(definitionKey => {
    const inst = getBlockByDefinitionRef(props, definitionKey);
    if (!inst || !isChoiceTag(inst.tag)) return [];
    const value = String(inst.attributes.value ?? definitionKey);
    // Explicit beats implicit: an authored code wins over the default table,
    // even when the two disagree (the parse-time typo guard warns, and the
    // author still gets the number they wrote).
    const authored = inst.attributes.code;
    const code = typeof authored === 'number'
      ? authored
      : defaultCodeForValue(value, reverseCoded);
    return [{ tag: inst.tag, value, code }];
  });
}
