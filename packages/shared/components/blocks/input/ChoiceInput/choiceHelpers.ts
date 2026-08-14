// packages/shared/components/blocks/input/ChoiceInput/choiceHelpers.ts
//
// Shared choice discovery for ChoiceInput (radio) and CheckboxInput.
//
// Fully static (kids structure + target= refs via the static DOM): this
// local is called by graders through inputApi, so it runs everywhere
// grading runs — selectors, node, analytics — where there is no dynamic
// (rendered) DOM.
//
import { getBlockByOLXId } from '@/lib/blocks';
import { parseAnyStateRef, stateKeyForGlobalRef, leafDefinitionKeyFromStateKey } from '@/lib/types/id-grammar';
import { isKidArray } from '@/lib/types/kids';
import type { DefinitionKey, RuntimeProps, StateRef } from '@/lib/types';

export interface Choice { id: DefinitionKey; tag: string; value: string }

const isChoiceTag = (tag: string) => tag === 'Key' || tag === 'Distractor';

/** Recursively collect Key/Distractor DefinitionKeys from a kids structure
 *  (choices may sit inside wrapper markup). */
function choiceKeysFromKids(props: RuntimeProps, kids: any): DefinitionKey[] {
  if (!isKidArray(kids)) return [];
  return kids.flatMap(k => {
    if (k.type === 'html') return choiceKeysFromKids(props, k.kids);
    if (k.type !== 'block') return [];
    const defKey = k.definitionKey;
    const inst = getBlockByOLXId(props, defKey);
    if (!inst) return [];
    if (isChoiceTag(inst.tag)) return [defKey];
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
  const defIds = targetRefs.length > 0
    ? targetRefs.map(ref => leafDefinitionKeyFromStateKey(
        stateKeyForGlobalRef(ref, props.runtime.ns)))
    : choiceKeysFromKids(props, props.kids);

  return defIds.flatMap(cid => {
    const inst = getBlockByOLXId(props, cid);
    if (!inst || !isChoiceTag(inst.tag)) return [];
    return [{ id: cid, tag: inst.tag, value: String(inst.attributes.value ?? cid) }];
  });
}
