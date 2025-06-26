import * as blocks from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import * as reduxLogger from 'lo_event/lo_event/reduxLogger.js';
import { run_llm } from '@/lib/llm/client.jsx';
import _Noop from './_Noop';

// src/components/blocks/LLMPrompt.jsx
// Action block to send a prompt to the LLM and store the response in `target`

const promptParser = parsers.childParser(async function parsePrompt({ rawKids, parseNode }) {
  const kids = [];
  for (const child of rawKids) {
    const tag = Object.keys(child).find(k => !['#text', '#comment', ':@'].includes(k));
    if (tag) {
      if (tag === 'Element') {
        const tagParsed = child[tag];
        const parts = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
        let ref = '';
        for (const p of parts) {
          if (typeof p === 'object' && p['#text']) ref += p['#text'];
        }
        kids.push({ type: 'element', ref: ref.trim() });
      } else {
        const id = await parseNode(child);
        if (id) kids.push({ type: 'block', id });
      }
    } else {
      const text = child['#text'] ?? '';
      if (text) kids.push({ type: 'text', text });
    }
  }
  return kids;
});
promptParser.staticKids = entry =>
  (Array.isArray(entry.kids) ? entry.kids : [])
    .filter(k => k && k.type === 'block')
    .map(k => k.id);

function doPrompt({ props }) {
  const { kids = [], target, tokens, temperature } = props;
  const textParts = [];
  const state = reduxLogger.store.getState()?.application_state?.component_state || {};

  for (const child of kids) {
    if (child.type === 'text') {
      textParts.push(child.text);
    } else if (child.type === 'element') {
      const refId = child.ref;
      const refInst = props.idMap[refId];
      const refBlueprint = refInst && props.componentMap[refInst.tag];
      if (refBlueprint?.getValue) {
        textParts.push(refBlueprint.getValue(state, refId) ?? '');
      }
    } else if (child.type === 'block') {
      const inst = props.idMap[child.id];
      const blueprint = props.componentMap[inst.tag];
      if (blueprint?.getValue) {
        textParts.push(blueprint.getValue(state, child.id) ?? '');
      }
    }
  }

  const prompt = textParts.join('');
  run_llm(target, { prompt, tokens, temperature });
}

const LLMPrompt = blocks.dev({
  ...promptParser,
  ...blocks.action({ action: doPrompt }),
  name: 'LLMPrompt',
  component: _Noop
});

export default LLMPrompt;
