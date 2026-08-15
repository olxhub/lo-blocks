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
import { blockReference, peggyParser, directKidDefinitionKeys } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import { splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import type { BlockReference, DefinitionRef } from '@/lib/types';
import * as matchingParser from './_matchingParser';

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
function generateMatchingComponents({ parsed, storeEntry, definitionKey, tag, attributes }: any) {
  const { title, pairs } = parsed as MatchingParsed;
  const parentRef = asDefinitionRef(splitNs(definitionKey).path);
  const ns = splitNs(definitionKey).ns;
  const blockRef = (definitionRef: DefinitionRef): BlockReference => blockReference(definitionRef, ns);

  // Generate definition refs for all components
  const problemRef = joinDefinitionRef(parentRef, PROBLEM);
  const graderRef = joinDefinitionRef(parentRef, GRADER);
  const inputRef = joinDefinitionRef(parentRef, INPUT);
  const titleRef = joinDefinitionRef(parentRef, TITLE);

  // Generate definition refs for each pair's left and right items
  const itemRefs = pairs.map((_, i) => ({
    left: joinDefinitionRef(parentRef, LEFT, i),
    right: joinDefinitionRef(parentRef, RIGHT, i),
  }));

  // Store title/prompt block if present
  let titleBlockRef: BlockReference | null = null;
  if (title) {
    storeEntry(titleRef, {
      id: titleRef,
      tag: 'Markdown',
      attributes: { id: titleRef },
      kids: title
    });
    titleBlockRef = blockRef(titleRef);
  }

  // Store left and right item blocks
  const inputKids: BlockReference[] = [];
  pairs.forEach((pair, i) => {
    // Store left item
    storeEntry(itemRefs[i].left, {
      id: itemRefs[i].left,
      tag: 'Markdown',
      attributes: { id: itemRefs[i].left },
      kids: pair.left
    });
    inputKids.push(blockRef(itemRefs[i].left));

    // Store right item
    storeEntry(itemRefs[i].right, {
      id: itemRefs[i].right,
      tag: 'Markdown',
      attributes: { id: itemRefs[i].right },
      kids: pair.right
    });
    inputKids.push(blockRef(itemRefs[i].right));
  });

  // Store MatchingInput
  storeEntry(inputRef, {
    id: inputRef,
    tag: 'MatchingInput',
    attributes: { id: inputRef },
    kids: inputKids
  });

  // Build MatchingGrader kids
  const graderKids: BlockReference[] = [];
  if (titleBlockRef) {
    graderKids.push(titleBlockRef);
  }
  graderKids.push(blockRef(inputRef));

  // Store MatchingGrader
  storeEntry(graderRef, {
    id: graderRef,
    tag: 'MatchingGrader',
    attributes: {
      id: graderRef,
      target: inputRef
    },
    kids: graderKids
  });

  // Store CapaProblem (the main container)
  storeEntry(problemRef, {
    id: problemRef,
    tag: 'CapaProblem',
    attributes: {
      id: problemRef,
      ...(title ? { title } : {}), // Use title as CapaProblem title if present
      ...attributes // Pass through any attributes from SimpleMatching tag
    },
    kids: [
      blockRef(graderRef)
    ]
  });

  // The generated problem becomes this block's only child.
  return [blockRef(problemRef)];
}

export const fields = state.fields([]);

const SimpleMatching = dev({
  ...peggyParser(matchingParser, {
    postprocess: generateMatchingComponents,
    skipStoreEntry: false // We handle storage in postprocess
  }),
  name: 'SimpleMatching',
  description: 'Simplified matching problem with DSL syntax - expands to CapaProblem+MatchingGrader+MatchingInput',
  // Non-conventional: this block doesn't render itself - it generates other
  // blocks in postprocess, so it reuses the shared layout Noop renderer.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  attributes: srcAttributes.passthrough(), // Allow passthrough for CapaProblem attributes
  // peggyParser sets staticKids: () => [], but SimpleMatching generates its
  // CapaProblem (and its grader/input/item subtree) dynamically in postprocess.
  // Without this, collectBlockWithKids won't ship the generated CapaProblem and
  // the client render fails with "Block <id>_problem not found in content".
  // Mirrors MarkupProblem; the generated CapaProblem's own staticKids recurses
  // the rest of the subtree.
  staticKids: directKidDefinitionKeys,
});

export default SimpleMatching;
