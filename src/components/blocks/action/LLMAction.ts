// src/components/blocks/LLMAction.js
import { z } from 'zod';
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import * as reduxClient from '@/lib/llm/reduxClient';
import { baseAttributes } from '@/lib/blocks/attributeSchemas';
import _Hidden from '@/components/blocks/layout/_Hidden';

export const fields = state.fields([]);

// Main LLM action function
async function llmAction({ targetId, targetInstance, targetBlueprint, props }) {
  const targetElementId = targetInstance.attributes.target;
  if (!targetElementId) {
    console.warn('⚠️ LLMAction: No target specified in action attributes');
    return;
  }

  // Get target component's fields dynamically
  const valueField = state.componentFieldByName(props, targetElementId, 'value');
  const stateField = state.componentFieldByName(props, targetElementId, 'state');

  try {
    state.updateField(props, valueField, '', { id: targetElementId });
    state.updateField(props, stateField, reduxClient.LLM_STATUS.RUNNING, { id: targetElementId });

    const promptText = blocks.extractChildText(props, props.nodeInfo.node);
    if (!promptText.trim()) {
      throw new Error('LLMAction: No prompt content found');
    }

    const content = await reduxClient.callLLMSimple(promptText);
    state.updateField(props, valueField, content, { id: targetElementId });
    state.updateField(props, stateField, reduxClient.LLM_STATUS.RESPONSE_READY, { id: targetElementId });

  } catch (error) {
    console.error('LLM generation failed:', error);
    state.updateField(props, valueField, `Error: ${error.message}`, { id: targetElementId });
    state.updateField(props, stateField, reduxClient.LLM_STATUS.ERROR, { id: targetElementId });
  }
}

// Custom parser that handles mixed text and block content
const llmActionParser = async function({ id, rawParsed, tag, attributes, provenance, provider, parseNode, storeEntry }) {
  const kids: any[] = [];

  // Process each child node in the raw parsed XML
  const childNodes = Array.isArray(rawParsed[tag]) ? rawParsed[tag] : [];

  for (const child of childNodes) {
    if (child['#text']) {
      // Text content - add as string
      kids.push(child['#text']);
    } else {
      // Block content - parse as normal
      const childTag = Object.keys(child).find(k => !['#text', '#comment', ':@'].includes(k));
      if (childTag) {
        const parsedChild = await parseNode(child);
        if (parsedChild) {
          kids.push(parsedChild);
        }
      }
    }
  }

  storeEntry(id, {
    id,
    tag,
    attributes,
    kids,
    provenance
  });
};

const LLMAction = blocks.test({
  parser: llmActionParser,
  staticKids: (entry: any) => {
    return (Array.isArray(entry.kids) ? entry.kids : [])
      .filter((k: any) => k && typeof k === 'object' && k.id)
      .map((k: any) => k.id);
  },
  ...blocks.action({
    action: llmAction,
  }),
  name: 'LLMAction',
  description: 'Executes LLM prompts with embedded Element references and updates target components',
  component: _Hidden,
  fields,
  attributes: baseAttributes.extend({
    target: z.string({ required_error: 'target is required' }).describe('ID of the TextSlot or LLMFeedback to write output to'),
  }),
});

export default LLMAction;
