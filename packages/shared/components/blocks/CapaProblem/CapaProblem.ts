// packages/shared/components/blocks/CapaProblem/CapaProblem.ts

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
import { splitNs, qualifyDefinitionRef, parseDefinitionRef, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import { isPascalCase } from '@/lib/util';
import * as state from '@/lib/state';
import { problemAttributes } from '@/lib/blocks/attributeSchemas';
import { gradingSelectors, problemGradeMode } from '@/lib/grading';
import type { KidEntry, DefinitionRef } from '@/lib/types';
import { rejectHtmlLang } from '@/lib/content/parsers';
import { elementKids, elementTag } from '@/lib/content/xmlParser';
import type { RawXmlNode } from '@/lib/content/xmlParser';

// A grader discovered while compiling Capa's mixed-content tree.
// `inputs` stores bare DefinitionRefs (not qualified DefinitionKeys) because
// auto-wired target attributes are an authored-ref channel — they go through
// the same Zod/parse pipeline as hand-written target="foo,bar" attributes.
type DiscoveredGrader = {
  node: RawXmlNode;
  inputs: DefinitionRef[];
  executesGrading: boolean;
  // Direct in the grading topology; HTML and non-grader wrappers are transparent.
  isDirectChildGrader: boolean;
};

// Typed child-role suffixes for joinDefinitionRef.
// Validated once at import time so typos are caught early.
const GRADER = parseLeafId('grader');
const INPUT = parseLeafId('input');

// Mutate generated grader attributes onto raw nodes so schemas validate them
// in the grader's own language variant. The raw tree is intentionally no
// longer pristine: post-parse updates through Capa's language context cannot
// safely address a differently-localized child variant.
function stampGeneratedGraderAttributes(
  discoveredGraders: DiscoveredGrader[],
  gradeMode: ReturnType<typeof problemGradeMode>,
): void {
  for (const grader of discoveredGraders) {
    const graderAttributes = grader.node[':@'] ??= {};
    if (grader.executesGrading && graderAttributes.target === undefined && grader.inputs.length > 0) {
      graderAttributes.target = grader.inputs.join(',');
    }
    // Metagraders derive aggregate state and do not accept execution-only
    // attributes. Their parsers govern the executable graders they generate.
    if (grader.isDirectChildGrader && grader.executesGrading) {
      graderAttributes.gradeMode = gradeMode;
    }
  }
}

// CapaProblem acts as a "metagrader" - it aggregates correctness from child
// graders. Aggregate grading state is DERIVED, never stored: Correctness/
// StatusText inside CapaProblem find CapaProblem as their grader and read it
// through useGradingState/selectGradingState (lib/grading), which aggregates
// the child graders' stored fields on read. Only genuine state (the
// showAnswer toggle) is declared here.
export const fields = state.fields([state.commonFields.showAnswer]);

// CapaProblem parser:
// 1. Assigns scoped IDs to descendant inputs and graders
// 2. Tracks grader-input relationships for auto-wiring `target` attributes
// 3. Builds mixed content structure (blocks + HTML + text) for rendering
//
// IDs are assigned by mutating nodes BEFORE child parsers run. See:
// docs/architecture/container-id-scoping.md
async function capaParser({ definitionKey, tag, attributes, source, parseDeps, rawParsed, storeEntry, parseNode, assignSystemId, ns, HACK_getBlockRolesForCapaProblem }) {
  const tagParsed = rawParsed[tag];
  const rawKids = (Array.isArray(tagParsed) ? tagParsed : [tagParsed]) as RawXmlNode[];
  let inputIndex = 0;
  let graderIndex = 0;
  let nodeIndex = 0;
  const discoveredGraders: DiscoveredGrader[] = [];
  // Parent ref for building child DefinitionRefs via joinDefinitionRef.
  const parentRef = asDefinitionRef(splitNs(definitionKey).path);

  function compileKids(nodes: RawXmlNode[], enclosingGrader: DiscoveredGrader | null): KidEntry[] {
    const kids: KidEntry[] = [];
    for (const node of nodes) {
      const kid = compileKid(node, enclosingGrader);
      if (kid) kids.push(kid);
    }
    return kids;
  }

  // Recursively assign IDs, discover grader relationships, and build kids.
  function compileKid(node: RawXmlNode, enclosingGrader: DiscoveredGrader | null): KidEntry | null {
    if (node['#text'] !== undefined) {
      const text = node['#text'];
      if (text.trim() === '') return null;
      return { type: 'text', text };
    }

    if (node['#comment'] !== undefined) return null;

    const childTag = elementTag(node);
    if (!childTag) return null;

    const childAttrs = node[':@'] ?? {};

    // TODO: Handle Open edX OLX cases: Label, Description, ResponseParam

    if (isPascalCase(childTag)) {
      // Role flags only — see the HACK note at the parser-context call site
      // in parseOLX.ts. The redesign TODO at the top of this file is what
      // eventually removes this.
      const blockGradingRole = HACK_getBlockRolesForCapaProblem(childTag);

      // Derive a branded DefinitionRef: auto-assigned via joinDefinitionRef,
      // or validated from an authored id attribute.
      let blockRef: DefinitionRef;
      if (!childAttrs.id) {
        if (blockGradingRole.isGrader) {
          blockRef = joinDefinitionRef(parentRef, GRADER, graderIndex++);
        } else if (blockGradingRole.isInput) {
          blockRef = joinDefinitionRef(parentRef, INPUT, inputIndex++);
        } else {
          blockRef = joinDefinitionRef(parentRef, parseLeafId(childTag.toLowerCase()), nodeIndex++);
        }
        assignSystemId(node, blockRef);
      } else {
        blockRef = parseDefinitionRef(childAttrs.id);
      }
      const childDefinitionKey = qualifyDefinitionRef(blockRef, ns);

      let graderForChildren = enclosingGrader;
      if (blockGradingRole.isGrader) {
        graderForChildren = {
          node,
          inputs: [],
          executesGrading: blockGradingRole.executesGrading,
          isDirectChildGrader: enclosingGrader === null,
        };
        discoveredGraders.push(graderForChildren);
      }
      if (blockGradingRole.isInput && enclosingGrader) {
        enclosingGrader.inputs.push(blockRef);
      }

      // The child block parser owns its kids, but Capa still discovers their
      // IDs and grading relationships before any child parser runs.
      for (const kid of elementKids(node, childTag)) {
        compileKid(kid, graderForChildren);
      }

      return { type: 'block', definitionKey: childDefinitionKey };
    }

    // HTML tag
    rejectHtmlLang(childTag, childAttrs);
    return {
      type: 'html',
      tag: childTag,
      attributes: childAttrs,
      id: childAttrs.id,
      kids: compileKids(elementKids(node, childTag), enclosingGrader),
    };
  }

  // Discover the complete subtree before invoking any child parser: generated
  // IDs and grader attributes must already be present when schemas run.
  const kids = compileKids(rawKids, null);
  stampGeneratedGraderAttributes(discoveredGraders, problemGradeMode(attributes));

  // Trigger the parser for each top-level block in the mixed-content tree.
  // Lowercase HTML is transparent for this purpose: Capa owns that HTML
  // structure, but a block beneath it must still own parsing its own kids.
  // Stop at block boundaries because block parsers recurse into their own
  // descendants; continuing here would parse those descendants twice.
  async function parseBlockFrontier(nodes: RawXmlNode[]): Promise<void> {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const childTag = elementTag(node);
      if (!childTag) continue;

      if (isPascalCase(childTag)) {
        await parseNode(node, nodes, index);
        continue;
      }

      await parseBlockFrontier(elementKids(node, childTag));
    }
  }

  await parseBlockFrontier(rawKids);

  storeEntry(definitionKey, { id: definitionKey, tag, attributes, source, parseDeps, kids });
  return definitionKey;
}

function collectDefinitionKeys(nodes: KidEntry[] = []) {
  return nodes.flatMap(n => {
    if (!n) return [];
    if (n.type === 'block') return [n.definitionKey];
    if (n.type === 'html') return collectDefinitionKeys(n.kids);
    return [];
  });
}

capaParser.staticKids = entry => collectDefinitionKeys(entry.kids);

const CapaProblem = dev({
  parser: capaParser,
  staticKids: capaParser.staticKids,
  name: 'CapaProblem',
  description: 'Interactive problem with rich content, inputs, grading, hints, explanations, and feedback',
  fields,
  isGrader: true,  // Metagrader: aggregates child grader states
  // Aggregate grading state is computed, never stored (fields above hold
  // only genuine state) — these selectors are how DSL refs, StatusText,
  // and orchestrators read it.
  selectors: gradingSelectors,
  attributes: z.object({
    ...problemAttributes.shape,
    displayName: z.string().optional().describe('Display name for the problem'),
    submitLabel: z.string().optional().describe('Override the check/submit button label (e.g. "Verify", "Answer", "Done", "OK")'),
  }).strict(),
});

export default CapaProblem;
