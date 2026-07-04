// packages/shared/components/blocks/specialized/LiquidTemplate/LiquidTemplate.ts
//
// LiquidTemplate block — renders a Liquid template with data at OLX parse time,
// producing child blocks that are first-class citizens (proper IDs, state, etc.).
//
// Usage:
//   <LiquidTemplate data="questions.yaml" src="template.liquid" />
//   <LiquidTemplate data="config.yaml"><![CDATA[ ... template ... ]]></LiquidTemplate>
//
// The template is rendered once with the data file contents as the Liquid context.
// The rendered output is parsed as OLX, and the resulting blocks become children
// of this container.

import { z } from 'zod';
import yaml from 'js-yaml';
import { Liquid } from 'liquidjs';

import { core } from '@/lib/blocks';
import { parseXmlFragment } from '@/lib/content/parseOLX';
import { loadExternalSource, extractTextFromXmlNodes } from '@/lib/content/parsers';
import { isDataFile, getExtension } from '@/lib/util/fileTypes';
import { _LiquidTemplate } from './_LiquidTemplate';
import { registerFilters } from './liquidFilters';

import type { LofsCanonical } from '@/lib/types/address';
import type { DefinitionRef, OLXLoadingError } from '@/lib/types';

// === Data file loading ===

function parseDataFile(text: string, src: string): any {
  if (getExtension(src) === 'json') {
    return JSON.parse(text);
  }
  return yaml.load(text, { schema: yaml.JSON_SCHEMA });
}

// === Liquid engine factory ===

function createLiquidEngine(): Liquid {
  const engine = new Liquid({
    strictVariables: true,
    strictFilters: true,
    ownPropertyOnly: true,
    trimTagLeft: true,
    trimTagRight: true,
    greedy: true,
  });
  registerFilters(engine);
  return engine;
}

// === Parser ===

async function liquidTemplateParser({
  id,
  rawParsed,
  tag,
  attributes,
  source,
  parseDeps: parseDepsIn,
  provider,
  parseNode,
  storeEntry,
  errors,
  metadata,
}: {
  id: any;
  rawParsed: any;
  tag: string;
  attributes: any;
  source: LofsCanonical;
  parseDeps: LofsCanonical[];
  provider: any;
  parseNode: (node: any, siblings: any[] | null, index: number) => Promise<any>;
  storeEntry: (id: DefinitionRef, entry: any) => void;
  errors: OLXLoadingError[];
  metadata: any;
}) {
  const parseDeps = [...parseDepsIn];

  // 1. Load data file
  if (!attributes.data) {
    throw new Error(`<LiquidTemplate id="${id}"> requires a data= attribute`);
  }

  if (!isDataFile(attributes.data)) {
    throw new Error(
      `<LiquidTemplate id="${id}">: data="${attributes.data}" must be a .yaml, .yml, or .json file`
    );
  }

  // data= and src= are siblings on the same element and must resolve
  // relative to the same file. loadExternalSource resolves against the
  // LAST entry of the parseDeps it's given, so both loads use the
  // unmutated parseDepsIn as their base — pushing the data dep before
  // loading src would make src resolve relative to the data file instead
  // of the OLX file that declared them both.
  const dataLoaded = await loadExternalSource({
    src: attributes.data,
    provider,
    source,
    parseDeps: parseDepsIn,
  });

  let data: any;
  try {
    data = parseDataFile(dataLoaded.text, attributes.data);
  } catch (e: any) {
    throw new Error(
      `<LiquidTemplate id="${id}">: failed to parse data file "${attributes.data}": ${e.message}`
    );
  }

  // 2. Get template text (src= or inline CDATA/text)
  let templateText: string;

  if (attributes.src) {
    const templateLoaded = await loadExternalSource({
      src: attributes.src,
      provider,
      source,
      parseDeps: parseDepsIn,
    });
    parseDeps.push(dataLoaded.dep, templateLoaded.dep);
    templateText = templateLoaded.text;
  } else {
    parseDeps.push(dataLoaded.dep);
    const tagParsed = rawParsed[tag];
    const kids = Array.isArray(tagParsed) ? tagParsed : [tagParsed];
    templateText = extractTextFromXmlNodes(kids, { preserveWhitespace: true }) as string;

    if (!templateText.trim()) {
      throw new Error(
        `<LiquidTemplate id="${id}">: no template provided. Use src= attribute or inline CDATA content.`
      );
    }
  }

  // 3. Render Liquid template
  const engine = createLiquidEngine();
  let renderedOlx: string;
  try {
    renderedOlx = await engine.parseAndRender(templateText, data);
  } catch (e: any) {
    throw new Error(
      `<LiquidTemplate id="${id}">: Liquid template error: ${e.message}`
    );
  }

  // 4. Parse rendered OLX as XML fragment
  let xmlNodes: any[];
  try {
    xmlNodes = parseXmlFragment(renderedOlx);
  } catch (e: any) {
    throw new Error(
      `<LiquidTemplate id="${id}">: rendered template produced invalid XML: ${e.message}`
    );
  }

  if (xmlNodes.length === 0) {
    throw new Error(
      `<LiquidTemplate id="${id}">: rendered template produced no XML elements`
    );
  }

  // 5. Parse each XML node through the standard block pipeline
  const kids: any[] = [];
  for (let i = 0; i < xmlNodes.length; i++) {
    const result = await parseNode(xmlNodes[i], xmlNodes, i);
    if (result?.id) {
      kids.push(result);
    }
  }

  // 6. Store entry
  storeEntry(id, {
    id,
    tag,
    attributes,
    source,
    parseDeps,
    kids,
    ...(metadata || {}),
  });

  return id;
}

// === Block definition ===

const LiquidTemplate = core({
  parser: liquidTemplateParser,
  staticKids: (entry) => {
    if (!Array.isArray(entry.kids)) return [];
    return entry.kids.filter(k => k && k.id).map(k => k.id);
  },
  name: 'LiquidTemplate',
  description: 'Renders a Liquid template with data at parse time, producing child OLX blocks.',
  component: _LiquidTemplate,
  attributes: z.object({
    data: z.string().describe('Path to YAML/JSON data file'),
    src: z.string().optional().describe('Path to .liquid template file'),
  }).strict(),
});

export default LiquidTemplate;
