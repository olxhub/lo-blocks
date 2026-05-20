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
import { dev } from '@/lib/blocks';
import { splitNs, definitionKeyForRef, parseDefinitionRef, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import { isPascalCase } from '@/lib/util';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import * as state from '@/lib/state';
import { problemAttributes } from '@/lib/blocks/attributeSchemas';
import _CapaProblem from './_CapaProblem';
import type { KidEntry, DefinitionKey, DefinitionRef } from '@/lib/types';

// Grader-input mapping for auto-wiring targets.
// `inputs` stores bare DefinitionRefs (not qualified DefinitionKeys) because
// auto-wired target attributes are an authored-ref channel — they go through
// the same Zod/parse pipeline as hand-written target="foo,bar" attributes.
type GraderMapping = { id: DefinitionKey; inputs: DefinitionRef[] };

// Typed child-role suffixes for joinDefinitionRef.
// Validated once at import time so typos are caught early.
const GRADER = parseLeafId('grader');
const INPUT  = parseLeafId('input');

// CapaProblem acts as a "metagrader" - it aggregates correctness from child graders.
// This allows Correctness/StatusText inside CapaProblem to find CapaProblem itself
// as their grader and display aggregate state.
export const fields = state.fields(state.graderFields());

// CapaProblem parser:
// 1. Assigns scoped IDs to descendant inputs and graders
// 2. Tracks grader-input relationships for auto-wiring `target` attributes
// 3. Builds mixed content structure (blocks + HTML + text) for rendering
//
// IDs are assigned by mutating nodes BEFORE child parsers run. See:
// docs/architecture/container-id-scoping.md
async function capaParser({ id, tag, attributes, provenance, rawParsed, storeEntry, parseNode, assignSystemId }) {
  const tagParsed = rawParsed[tag];
  const rawKids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const graders: GraderMapping[] = [];
  // Parent ref for building child IDs via joinDefinitionRef.
  const parentRef = asDefinitionRef(splitNs(id).path);

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

    const childAttrs = node[':@'] ?? {};

    // TODO: Handle Open edX OLX cases: Label, Description, ResponseParam

    if (isPascalCase(childTag)) {
      const blockType = BLOCK_REGISTRY[childTag];

      // Derive a branded DefinitionRef: auto-assigned via joinDefinitionRef,
      // or validated from an authored id attribute.
      let blockRef: DefinitionRef;
      if (!childAttrs.id) {
        if (blockType.isGrader) {
          blockRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        } else if (blockType.isInput) {
          blockRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);
        } else {
          blockRef = joinDefinitionRef(parentRef, parseLeafId(childTag.toLowerCase()), nodeIndex++);
        }
        assignSystemId(node, blockRef);
      } else {
        blockRef = parseDefinitionRef(childAttrs.id);
      }
      const blockId = definitionKeyForRef(blockRef);

      let mapping = currentGrader;
      if (blockType.isGrader) {
        mapping = { id: blockId, inputs: [] };
        graders.push(mapping);
      }
      if (blockType.isInput && currentGrader) {
        currentGrader.inputs.push(blockRef);
      }

      const kids = node[childTag];
      const kidsArray = Array.isArray(kids) ? kids : (kids ? [kids] : []);
      for (const kid of kidsArray) {
        assignIdsAndBuildStructure(kid, mapping);
      }

      return { type: 'block', id: blockId };
    }

    // HTML tag
    const kids = node[childTag];
    const kidsArray = Array.isArray(kids) ? kids : [];
    const childKids: KidEntry[] = [];
    for (const n of kidsArray) {
      const result = assignIdsAndBuildStructure(n, currentGrader);
      if (result) childKids.push(result as KidEntry);
    }
    return { type: 'html', tag: childTag, attributes: childAttrs, id: childAttrs.id, kids: childKids };
  }

  // Assign IDs to all descendants and build kids structure
  const kidsParsed: KidEntry[] = [];
  for (const n of rawKids) {
    const result = assignIdsAndBuildStructure(n, null);
    if (result) kidsParsed.push(result as KidEntry);
  }

  // Call parseNode on immediate block children to trigger their parsers
  for (const n of rawKids) {
    const childTag = Object.keys(n).find(k => ![':@', '#text', '#comment'].includes(k));
    if (childTag && isPascalCase(childTag)) {
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

function collectIds(nodes: KidEntry[] = []) {
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
  attributes: z.object({
    ...problemAttributes.shape,
    displayName: z.string().optional().describe('Display name for the problem'),
  }).strict(),
});

export default CapaProblem;

