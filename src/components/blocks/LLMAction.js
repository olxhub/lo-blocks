// src/components/blocks/LLMAction.js
import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import * as state from '@/lib/state';
import * as reduxClient from '@/lib/llm/reduxClient';
import _Noop from './_Noop';

export const fields = state.fields([]);


// Update target field with content
async function updateTargetField(props, targetInstance, content) {
  const targetElementId = targetInstance.attributes.target;
  if (!targetElementId) {
    console.warn('⚠️ LLMAction: No target specified in action attributes');
    return;
  }

  const field = state.componentFieldByName(props, targetElementId, 'value');
  state.updateReduxField(props, field, content, { id: targetElementId });
}

// Main LLM action function
async function llmAction({ targetId, targetInstance, targetBlueprint, props }) {
  try {
    const promptText = await extractPromptText(props.nodeInfo.node, props);
    if (!promptText.trim()) {
      throw new Error('LLMAction: No prompt content found');
    }

    const content = await reduxClient.callLLMSimple(promptText);
    await updateTargetField(props, targetInstance, content);

  } catch (error) {
    console.error('LLM generation failed:', error);
    await updateTargetField(props, targetInstance, `Error: ${error.message}`);
  }
}

// Helper function to extract prompt text directly from LLMAction content
async function extractPromptText(actionNode, props) {
  const { kids = [] } = actionNode;
  let promptText = '';

  for (const [index, kid] of kids.entries()) {
    if (typeof kid === 'string') {
      promptText += kid;
    } else if (kid.type === 'text') {
      promptText += kid.text;
    } else if (kid.type === 'block') {
      const blockNode = props.idMap[kid.id];
      const blockBlueprint = props.componentMap[blockNode.tag];

      if (blockBlueprint.getValue) {
        // Use the block's getValue method to get the actual value
        const reduxLogger = await import('lo_event/lo_event/reduxLogger.js');
        const state = reduxLogger.store.getState()?.application_state || {};

        const blockValue = blockBlueprint.getValue(
          state.component,
          kid.id,
          blockNode.attributes,
          props.idMap
        );
        promptText += blockValue;
      } else {
        console.warn(`⚠️ extractPromptText: Block ${blockNode.tag} (${kid.id}) has no getValue method`);
        const fallback = `[BLOCK_${kid.id}]`;
        promptText += fallback;
      }
    } else {
      console.warn(`❓ extractPromptText: Unknown kid type:`, kid);
    }

  }
  return promptText.trim();
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
  component: _Noop,
  fields,
});

export default LLMAction;
