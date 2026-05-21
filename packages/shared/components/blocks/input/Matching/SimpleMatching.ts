/**
 * SimpleMatching block - simplified matching problem with DSL syntax
 *
 * Syntax:
 *   Optional Title
 *   ==============
 *   left term: right definition
 *   left term: right definition
 *
 * Or without title:
 *   left term: right definition
 *   left term: right definition
 *
 * This expands to: CapaProblem + MatchingGrader + MatchingInput + Markdown items
 */

import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import { splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import type { DefinitionRef } from '@/lib/types';
import * as matchingParser from './_matchingParser';
import _Noop from '@/components/blocks/layout/_Noop';

// Typed child-role suffixes for joinDefinitionRef.
const PROBLEM = parseLeafId('problem');
const GRADER  = parseLeafId('grader');
const INPUT   = parseLeafId('input');
const TITLE   = parseLeafId('title');
const LEFT    = parseLeafId('left');
const RIGHT   = parseLeafId('right');

/** PEG parser output for matching DSL. */
interface MatchingParsed {
  title: string;
  pairs: { left: string; right: string }[];
}

/**
 * Generate all required components for a matching problem
 * Expands DSL into CapaProblem + MatchingGrader + MatchingInput + Markdown items
 */
function generateMatchingComponents({ parsed, storeEntry, id, tag, attributes }: any) {
  const { title, pairs } = parsed as MatchingParsed;
  const parentRef = asDefinitionRef(splitNs(id).path);

  // Generate IDs for all components
  const problemId = joinDefinitionRef(parentRef, PROBLEM);
  const graderId = joinDefinitionRef(parentRef, GRADER);
  const inputId = joinDefinitionRef(parentRef, INPUT);
  const titleId = joinDefinitionRef(parentRef, TITLE);

  // Generate IDs for each pair's left and right items
  const itemIds = pairs.map((_, i) => ({
    left: joinDefinitionRef(parentRef, LEFT, i),
    right: joinDefinitionRef(parentRef, RIGHT, i),
  }));

  // Store title/prompt block if present
  let titleBlockRef: { type: 'block'; id: DefinitionRef } | null = null;
  if (title) {
    storeEntry(titleId, {
      id: titleId,
      tag: 'Markdown',
      attributes: { id: titleId },
      kids: title
    });
    titleBlockRef = { type: 'block', id: titleId };
  }

  // Store left and right item blocks
  const inputKids: { type: 'block'; id: DefinitionRef }[] = [];
  pairs.forEach((pair, i) => {
    // Store left item
    storeEntry(itemIds[i].left, {
      id: itemIds[i].left,
      tag: 'Markdown',
      attributes: { id: itemIds[i].left },
      kids: pair.left
    });
    inputKids.push({ type: 'block', id: itemIds[i].left });

    // Store right item
    storeEntry(itemIds[i].right, {
      id: itemIds[i].right,
      tag: 'Markdown',
      attributes: { id: itemIds[i].right },
      kids: pair.right
    });
    inputKids.push({ type: 'block', id: itemIds[i].right });
  });

  // Store MatchingInput
  storeEntry(inputId, {
    id: inputId,
    tag: 'MatchingInput',
    attributes: { id: inputId },
    kids: inputKids
  });

  // Build MatchingGrader kids
  const graderKids: { type: 'block'; id: DefinitionRef }[] = [];
  if (titleBlockRef) {
    graderKids.push(titleBlockRef);
  }
  graderKids.push({ type: 'block', id: inputId });

  // Store MatchingGrader
  storeEntry(graderId, {
    id: graderId,
    tag: 'MatchingGrader',
    attributes: {
      id: graderId,
      target: inputId
    },
    kids: graderKids
  });

  // Store CapaProblem (the main container)
  storeEntry(problemId, {
    id: problemId,
    tag: 'CapaProblem',
    attributes: {
      id: problemId,
      ...(title ? { title } : {}), // Use title as CapaProblem title if present
      ...attributes // Pass through any attributes from SimpleMatching tag
    },
    kids: [
      { type: 'block', id: graderId }
    ]
  });

  // Return the main problem ID - this becomes the "SimpleMatching"
  return [{ type: 'block', id: problemId }];
}

export const fields = state.fields([]);

const SimpleMatching = dev({
  ...peggyParser(matchingParser, {
    postprocess: generateMatchingComponents,
    skipStoreEntry: false // We handle storage in postprocess
  }),
  name: 'SimpleMatching',
  description: 'Simplified matching problem with DSL syntax - expands to CapaProblem+MatchingGrader+MatchingInput',
  component: _Noop, // This component doesn't render - it generates others
  fields,
  attributes: srcAttributes.passthrough(), // Allow passthrough for CapaProblem attributes
});

export default SimpleMatching;
