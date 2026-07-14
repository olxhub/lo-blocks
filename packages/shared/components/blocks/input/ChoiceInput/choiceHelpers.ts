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
import { qualifyDefinitionRef } from '@/lib/types/id-grammar';
import { isKidArray } from '@/lib/util/kids';
import type { DefinitionKey, DefinitionRef, RuntimeProps } from '@/lib/types';

export interface Choice { id: DefinitionKey; tag: string; value: string }

const isChoiceTag = (tag: string) => tag === 'Key' || tag === 'Distractor';

/** Recursively collect Key/Distractor DefinitionKeys from a kids structure
 *  (choices may sit inside wrapper markup). */
function choiceKeysFromKids(props: RuntimeProps, kids: any): DefinitionKey[] {
  if (!isKidArray(kids)) return [];
  return kids.flatMap(k => {
    if (k.type === 'html') return choiceKeysFromKids(props, k.kids);
    if (k.type !== 'block') return [];
    const defKey = qualifyDefinitionRef(k.id, props.runtime.ns);
    const inst = getBlockByOLXId(props, defKey);
    if (!inst) return [];
    if (isChoiceTag(inst.tag)) return [defKey];
    return choiceKeysFromKids(props, inst.kids);
  });
}

export function getChoices(props: RuntimeProps, _state: unknown, _id: unknown): Choice[] {
  // Explicit target= refs (choices not nested as kids), else the kids walk.
  const targetRefs: DefinitionRef[] = props.target
    ? (Array.isArray(props.target) ? props.target : String(props.target).split(','))
      .map((t: string) => t.trim()).filter(Boolean) as DefinitionRef[]
    : [];
  const defIds = targetRefs.length > 0
    ? targetRefs.map(ref => qualifyDefinitionRef(ref, props.runtime.ns))
    : choiceKeysFromKids(props, props.kids);

  return defIds.flatMap(cid => {
    const inst = getBlockByOLXId(props, cid);
    if (!inst || !isChoiceTag(inst.tag)) return [];
    return [{ id: cid, tag: inst.tag, value: String(inst.attributes.value ?? cid) }];
  });
}
