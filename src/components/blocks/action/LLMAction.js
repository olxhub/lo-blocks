// src/components/blocks/LLMAction.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import * as reduxClient from '@/lib/llm/reduxClient';
import _Hidden from '@/components/blocks/layout/_Hidden';
import { fields as feedbackFields } from './LLMFeedback';

export const fields = state.fields([]);

// Main LLM action function
async function llmAction({ targetId, targetInstance, targetBlueprint, props }) {
  const targetElementId = targetInstance.attributes.target;
  if (!targetElementId) {
    console.warn('⚠️ LLMAction: No target specified in action attributes');
    return;
  }

  // TODO: Should use processed fields (e.g., `const { value, state } = fields`) instead of
  // accessing .fieldInfoByField directly. Need to figure out cross-component field access pattern.
  const { value: valueField, state: stateField } = feedbackFields.fieldInfoByField;

  try {
    state.updateReduxField(props, valueField, '', { id: targetElementId });
    state.updateReduxField(props, stateField, reduxClient.LLM_STATUS.RUNNING, { id: targetElementId });

    const promptText = await blocks.extractChildText(props, props.nodeInfo.node);
    if (!promptText.trim()) {
      throw new Error('LLMAction: No prompt content found');
    }

    const content = await reduxClient.callLLMSimple(promptText);
    state.updateReduxField(props, valueField, content, { id: targetElementId });
    state.updateReduxField(props, stateField, reduxClient.LLM_STATUS.RESPONSE_READY, { id: targetElementId });

  } catch (error) {
    console.error('LLM generation failed:', error);
    state.updateReduxField(props, valueField, `Error: ${error.message}`, { id: targetElementId });
    state.updateReduxField(props, stateField, reduxClient.LLM_STATUS.ERROR, { id: targetElementId });
  }
}

// Custom parser that handles mixed text and block content
const llmActionParser = async function({ id, rawParsed, tag, attributes, provenance, provider, parseNode, storeEntry }) {
  const kids = [];

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
    provenance,
    rawParsed: { [tag]: rawParsed[tag], ':@': rawParsed[':@'] }
  });
};

const LLMAction = blocks.test({
  parser: llmActionParser,
  staticKids: (entry) => {
    return (Array.isArray(entry.kids) ? entry.kids : [])
      .filter(k => k && typeof k === 'object' && k.id)
      .map(k => k.id);
  },
  ...blocks.action({
    action: llmAction,
  }),
  name: 'LLMAction',
  description: 'Executes LLM prompts with embedded Element references and updates target components',
  component: _Hidden,
  fields,
});

export default LLMAction;
