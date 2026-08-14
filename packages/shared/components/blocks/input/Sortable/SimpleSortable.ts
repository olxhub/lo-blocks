// packages/shared/components/blocks/input/Sortable/SimpleSortable.ts
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { blockReference, peggyParser, directKidDefinitionKeys } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import { splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
import type { BlockReference, DefinitionRef } from '@/lib/types';
import * as sortParser from './_sortParser';

// Typed child-role suffixes for joinDefinitionRef.
const PROBLEM = parseLeafId('problem');
const GRADER  = parseLeafId('grader');
const INPUT   = parseLeafId('input');
const PROMPT  = parseLeafId('prompt');
const ITEM    = parseLeafId('item');

/**
 * Generate all required components for a sortable problem
 * This uses storeEntry to create multiple components from a single SimpleSortable
 */
function generateSortableComponents({ parsed, storeEntry, definitionKey, tag, attributes }) {
  const { prompt, items } = parsed;
  const parentRef = asDefinitionRef(splitNs(definitionKey).path);
  const ns = splitNs(definitionKey).ns;
  const blockRef = (definitionRef: DefinitionRef): BlockReference => blockReference(definitionRef, ns);

  // Generate definition refs for all components
  const problemRef = joinDefinitionRef(parentRef, PROBLEM);
  const graderRef = joinDefinitionRef(parentRef, GRADER);
  const inputRef = joinDefinitionRef(parentRef, INPUT);
  const promptRef = joinDefinitionRef(parentRef, PROMPT);
  const itemRefs = items.map((_, i) => joinDefinitionRef(parentRef, ITEM, i));

  // Store prompt block (using Markdown for rich text)
  storeEntry(promptRef, {
    id: promptRef,
    tag: 'Markdown',
    attributes: { id: promptRef },
    kids: prompt
  });

  // Store item blocks
  items.forEach((item, i) => {
    storeEntry(itemRefs[i], {
      id: itemRefs[i],
      tag: 'Markdown',
      attributes: {
        id: itemRefs[i],
        // Add initialPosition attribute if item has explicit ordering
        ...(item.initialPosition ? { initialPosition: item.initialPosition.toString() } : {})
      },
      kids: item.content
    });
  });

  // Store SortableInput
  storeEntry(inputRef, {
    id: inputRef,
    tag: 'SortableInput',
    attributes: { id: inputRef },
    kids: itemRefs.map(blockRef)
  });

  // Store SortableGrader
  storeEntry(graderRef, {
    id: graderRef,
    tag: 'SortableGrader',
    attributes: {
      id: graderRef,
      target: inputRef
    },
    kids: [
      blockRef(promptRef),
      blockRef(inputRef)
    ]
  });

  // Store CapaProblem (the main container)
  storeEntry(problemRef, {
    id: problemRef,
    tag: 'CapaProblem',
    attributes: {
      id: problemRef,
      ...attributes // Pass through any attributes from SimpleSortable
    },
    kids: [
      blockRef(graderRef)
    ]
  });

  // The generated problem becomes this block's only child.
  return [blockRef(problemRef)];
}

export const fields = state.fields([]);

const SimpleSortable = dev({
  ...peggyParser(sortParser, {
    postprocess: generateSortableComponents,
    skipStoreEntry: false // We handle storage in postprocess
  }),
  name: 'SimpleSortable',
  description: 'Simplified sortable problem with PEG syntax - expands to CapaProblem+SortableGrader+SortableInput',
  // Non-conventional: this block doesn't render itself - it generates other
  // blocks in postprocess, so it reuses the shared layout Noop renderer.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
  fields,
  attributes: srcAttributes.passthrough(), // Allow passthrough for CapaProblem attributes
  // peggyParser sets staticKids: () => [], but SimpleSortable generates its
  // CapaProblem (and its grader/input/item subtree) dynamically in postprocess.
  // Without this, collectBlockWithKids won't ship the generated CapaProblem and
  // the client render fails with "Block <id>_problem not found in content".
  // Mirrors MarkupProblem; the generated CapaProblem's own staticKids recurses
  // the rest of the subtree.
  staticKids: directKidDefinitionKeys,
});

export default SimpleSortable;
