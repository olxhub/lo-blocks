// src/components/blocks/CapaProblem/CapaProblem.test.js
//
// Unit tests for CapaProblem parser behavior.
// Render tests are covered by demo-render.test.js which tests all .olx files.
//
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { FileStorageProvider } from '@/lib/lofs/providers/file';
import type { IdMap, OlxJson, OlxKey, ContentVariant } from '@/lib/types';

// Helper: extract first available variant from idMap for a given block ID.
// Accepts string for convenience in tests (cast to OlxKey internally).
const getOlxJson = (idMap: IdMap, id: string): OlxJson | undefined => {
  const variantMap = idMap[id as OlxKey];
  if (!variantMap) return undefined;
  const variants = Object.keys(variantMap) as ContentVariant[];
  return variants.length > 0 ? variantMap[variants[0]] : undefined;
};

// Helper to get OlxJson from idMap (language extraction happens in indexParsedBlocks)
// idMap now stores nested structure: { id: { locale: OlxJson } }
// For tests, use first available locale (same fallback as getBestLocale functions)
const getOlxJson = (idMap: any, id: string) => {
  const langMap = idMap[id];
  if (!langMap) return undefined;
  const locales = Object.keys(langMap);
  return locales.length > 0 ? langMap[locales[0]] : undefined;
};

// Helper to get OlxJson from idMap (language extraction happens in indexParsedBlocks)
// idMap now stores nested structure: { id: { locale: OlxJson } }
// For tests, use first available locale (same fallback as getBestLocale functions)
const getOlxJson = (idMap: any, id: string) => {
  const langMap = idMap[id];
  if (!langMap) return undefined;
  const locales = Object.keys(langMap);
  return locales.length > 0 ? langMap[locales[0]] : undefined;
};

it('wires inputs and graders with explicit targeting', async () => {
  const { idMap } = await syncContentFromStorage(new FileStorageProvider('src/components/blocks/CapaProblem'));
  const root = idMap['CapaProblemTargeting'];
  expect(root).toBeDefined();

  // RatioGrader with explicit target="num,den"
  const graderId = 'CapaProblemTargeting_grader_0';
  expect(getOlxJson(idMap, graderId)).toBeDefined();
  expect(getOlxJson(idMap, 'num')).toBeDefined();
  expect(getOlxJson(idMap, 'den')).toBeDefined();

  // Grader should have target wired to the two inputs
  expect(getOlxJson(idMap, graderId).attributes.target).toBe('num,den');

  // Render-time controls should NOT be injected into idMap by the parser
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_button');
  expect(Object.keys(idMap)).not.toContain('CapaProblemTargeting_correctness');
});
