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
import { splitNs } from '@/lib/types/id-grammar';
import * as matchingParser from './_matchingParser';
import _Noop from '@/components/blocks/layout/_Noop';

/**
 * Generate all required components for a matching problem
 * Expands DSL into CapaProblem + MatchingGrader + MatchingInput + Markdown items
 */
function generateMatchingComponents({ parsed, storeEntry, id, tag, attributes }: any) {
  const { title, pairs } = parsed as any;
  // Extract bare id for building child IDs. storeEntry auto-qualifies.
  const bareId = splitNs(id).path;

  // Generate IDs for all components
  const problemId = `${bareId}_problem`;
  const graderId = `${bareId}_grader`;
  const inputId = `${bareId}_input`;
  const titleId = `${bareId}_title`;

  // Generate IDs for each pair's left and right items
  const itemIds: any[] = [];
  (pairs as any[]).forEach((pair: any, i: number) => {
    itemIds.push({
      left: `${bareId}_left_${i}`,
      right: `${bareId}_right_${i}`
    });
  });

  // Store title/prompt block if present
  let titleBlockRef: any = null;
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
  const inputKids: any[] = [];
  (pairs as any[]).forEach((pair: any, i: number) => {
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
  const graderKids: any[] = [];
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
