// src/components/blocks/CapaProblem/CapaProblem.js

/*
 * TODO: This codebase (CapaProblem, _CapaProblem) should be
 * re-architected at some point. It started as scaffolding to develop
 * inputs and graders, and has evolved incrementally without a proper
 * rethink.
 *
 * The major questions are about:
 * - What should be done at parse time versus render time?
 * - Specifically, when and how should controls / chrome like
 *   explanations, buttons, etc. be injected?
 * - To what extent should we have a default look-and-feel?
 * - Which OLX commands should lead to rendering versus be
 *   treated as data (e.g. <Explanation>)?
 * - Which chrome is associated with each grader versus the
 *   whole problem? Submit once per grader? All at once?
 * Etc.
 *
 * This was difficult to do in the early system, but the frameworks
 * for graders, inputs, and parsing are thoughtful and robust. That
 * means we can do a redesign whenever we get around to it.
 *
 * However, CapaProblem itself should not be treated as especially
 * thoughtful or robust itself. It is not.
 */

import { z } from 'zod';
import { dev, refToReduxKey } from '@/lib/blocks';
import { isBlockTag } from '@/lib/util';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import * as state from '@/lib/state';
import { baseAttributes, problemMixin } from '@/lib/blocks/attributeSchemas';
import _CapaProblem from './_CapaProblem';
import type { ReduxStateKey, BlueprintKidEntry, OlxReference } from '@/lib/types';

// Grader-input mapping for auto-wiring targets
type GraderMapping = { id: ReduxStateKey; inputs: ReduxStateKey[] };

// CapaProblem acts as a "metagrader" - it aggregates correctness from child graders.
// This allows Correctness/StatusText inside CapaProblem to find CapaProblem itself
// as their grader and display aggregate state.
export const fields = state.fields(['correct', 'message', 'submitCount']);

// CapaProblem parser:
// 1. Assigns scoped IDs to descendant inputs and graders
// 2. Tracks grader-input relationships for auto-wiring `target` attributes
// 3. Builds mixed content structure (blocks + HTML + text) for rendering
//
// IDs are assigned by mutating nodes BEFORE child parsers run. See:
// docs/architecture/container-id-scoping.md
async function capaParser({ id, tag, attributes, provenance, rawParsed, storeEntry, parseNode }) {
  const tagParsed = rawParsed[tag];
  const rawKids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const graders: GraderMapping[] = [];

  // Recursively assign IDs to all descendants and build kids structure (mutates nodes)
  function assignIdsAndBuildStructure(node, currentGrader: GraderMapping | null = null) {
    if (node['#text'] !== undefined) {
      const text = node['#text'];
      if (text.trim() === '') return null;
      return { type: 'text', text };
    }

    if (node['#comment'] !== undefined) return null;

    const childTag = Object.keys(node).find(k => ![':@', '#text', '#comment'].includes(k));
    if (!childTag) return null;

    if (!node[':@']) node[':@'] = {};
    const childAttrs = node[':@'];

    // TODO: Handle Open edX OLX cases: Label, Description, ResponseParam

    if (isBlockTag(childTag)) {
      const blockType = BLOCK_REGISTRY[childTag];

      if (!childAttrs.id) {
        let defaultId;
        if (blockType.isGrader) {
          defaultId = `${id}_grader_${graderIndex++}`;
        } else if (blockType.getValue) {
          defaultId = `${id}_input_${inputIndex++}`;
        } else {
          defaultId = `${id}_${childTag.toLowerCase()}_${nodeIndex++}`;
        }
        childAttrs.id = defaultId;
      }
      const blockId = refToReduxKey(childAttrs);
      childAttrs.id = blockId;

      let mapping = currentGrader;
      if (blockType.isGrader) {
        mapping = { id: blockId, inputs: [] };
        graders.push(mapping);
      }
      if (blockType.getValue && currentGrader) {
        currentGrader.inputs.push(blockId);
      }

      const kids = node[childTag];
      const kidsArray = Array.isArray(kids) ? kids : (kids ? [kids] : []);
      for (const kid of kidsArray) {
        assignIdsAndBuildStructure(kid, mapping);
      }

      // TODO BUG HACK: CapaProblem generates ReduxStateKey-formatted IDs at parse time,
      // but BlueprintKidEntry expects OlxReference. This conflates two ID stages:
      // - OlxReference: static refs in OLX content (e.g., "foo", "./foo")
      // - ReduxStateKey: runtime keys with idPrefix (e.g., "problem:0:foo")
      //
      // This is a type system violation that masks a real architectural issue.
      // Fix by either:
      // 1. Not scoping IDs at parse time (defer to render), or
      // 2. Having a separate type for "parsed with scoped IDs" entries
      //
      // See docs/README.md "IDs" section for the ID type hierarchy.
      return { type: 'block', id: blockId as unknown as OlxReference };
    }

    // HTML tag
    const kids = node[childTag];
    const kidsArray = Array.isArray(kids) ? kids : [];
    const childKids: BlueprintKidEntry[] = [];
    for (const n of kidsArray) {
      const result = assignIdsAndBuildStructure(n, currentGrader);
      if (result) childKids.push(result as BlueprintKidEntry);
    }
    return { type: 'html', tag: childTag, attributes: childAttrs, id: childAttrs.id, kids: childKids };
  }

  // Assign IDs to all descendants and build kids structure
  const kidsParsed: BlueprintKidEntry[] = [];
  for (const n of rawKids) {
    const result = assignIdsAndBuildStructure(n, null);
    if (result) kidsParsed.push(result as BlueprintKidEntry);
  }

  // Call parseNode on immediate block children to trigger their parsers
  for (const n of rawKids) {
    const childTag = Object.keys(n).find(k => ![':@', '#text', '#comment'].includes(k));
    if (childTag && isBlockTag(childTag)) {
      const kids = n[childTag];
      const kidsArray = Array.isArray(kids) ? kids : (kids ? [kids] : []);
      await parseNode(n, kidsArray, 0);
    }
  }

  // Auto-wire grader targets
  for (const g of graders) {
    if (g.inputs.length > 0) {
      storeEntry(g.id, (existing) => ({
        ...existing,
        attributes: { ...existing.attributes, target: g.inputs.join(',') }
      }));
    }
  }

  const entry = { id, tag, attributes, provenance, kids: kidsParsed };
  storeEntry(id, entry);
  return id;
}

function collectIds(nodes: BlueprintKidEntry[] = []) {
  return nodes.flatMap(n => {
    if (!n) return [];
    if (n.type === 'block' && n.id) return [n.id];
    if (n.type === 'html') return collectIds(n.kids);
    return [];
  });
}

capaParser.staticKids = entry => collectIds(entry.kids);

const CapaProblem = dev({
  parser: capaParser,
  staticKids: capaParser.staticKids,
  name: 'CapaProblem',
  description: 'Interactive problem with rich content, inputs, grading, hints, explanations, and feedback',
  component: _CapaProblem,
  fields,
  isGrader: true,  // Metagrader: aggregates child grader states
  attributes: baseAttributes.extend(problemMixin.shape).extend({
    displayName: z.string().optional().describe('Display name for the problem'),
  }),
});

export default CapaProblem;

