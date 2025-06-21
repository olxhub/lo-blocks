// src/lib/content/parseOLX.test.js
import { parseOLX } from './parseOLX';

const PROV = ['file://test.xml'];

test('returns root id of single element', async () => {
  const xml = '<Lesson id="root"><TextBlock id="child"/></Lesson>';
  const { root, idMap } = await parseOLX(xml, PROV);
  expect(root).toBe('root');
  expect(idMap[root]).toBeDefined();
});

test('returns first element id when multiple roots', async () => {
  const xml = '<Lesson id="one"/><Lesson id="two"/>';
  const { root } = await parseOLX(xml, PROV);
  expect(root).toBe('one');
});
