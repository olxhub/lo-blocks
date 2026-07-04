// packages/shared/components/blocks/input/Sortable/SimpleSortable.ts
import { dev } from '@/lib/blocks';
import * as state from '@/lib/state';
import { peggyParser } from '@/lib/content/parsers';
import { srcAttributes } from '@/lib/blocks/attributeSchemas';
import { splitNs, asDefinitionRef, joinDefinitionRef, parseLeafId } from '@/lib/types/id-grammar';
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
function generateSortableComponents({ parsed, storeEntry, id, tag, attributes }) {
  const { prompt, items } = parsed;
  const parentRef = asDefinitionRef(splitNs(id).path);

  // Generate IDs for all components
  const problemId = joinDefinitionRef(parentRef, PROBLEM);
  const graderId = joinDefinitionRef(parentRef, GRADER);
  const inputId = joinDefinitionRef(parentRef, INPUT);
  const promptId = joinDefinitionRef(parentRef, PROMPT);
  const itemIds = items.map((_, i) => joinDefinitionRef(parentRef, ITEM, i));

  // Store prompt block (using Markdown for rich text)
  storeEntry(promptId, {
    id: promptId,
    tag: 'Markdown',
    attributes: { id: promptId },
    kids: prompt
  });

  // Store item blocks
  items.forEach((item, i) => {
    storeEntry(itemIds[i], {
      id: itemIds[i],
      tag: 'Markdown',
      attributes: {
        id: itemIds[i],
        // Add initialPosition attribute if item has explicit ordering
        ...(item.initialPosition ? { initialPosition: item.initialPosition.toString() } : {})
      },
      kids: item.content
    });
  });

  // Store SortableInput
  storeEntry(inputId, {
    id: inputId,
    tag: 'SortableInput',
    attributes: { id: inputId },
    kids: itemIds.map(itemId => ({ type: 'block', id: itemId }))
  });

  // Store SortableGrader
  storeEntry(graderId, {
    id: graderId,
    tag: 'SortableGrader',
    attributes: {
      id: graderId,
      target: inputId
    },
    kids: [
      { type: 'block', id: promptId },
      { type: 'block', id: inputId }
    ]
  });

  // Store CapaProblem (the main container)
  storeEntry(problemId, {
    id: problemId,
    tag: 'CapaProblem',
    attributes: {
      id: problemId,
      ...attributes // Pass through any attributes from SimpleSortable
    },
    kids: [
      { type: 'block', id: graderId }
    ]
  });

  // Return the main problem ID - this becomes the "SimpleSortable"
  return [{ type: 'block', id: problemId }];
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
});

export default SimpleSortable;