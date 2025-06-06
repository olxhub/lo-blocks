import path from 'path';
import { __testables } from './loadContentTree';

const { loadXmlFilesWithStats } = __testables;

it('handles added, unchanged, changed, and deleted files via in-memory mutation', async () => {
  const testDir = './content';

  // First pass: capture baseline
  const first = await loadXmlFilesWithStats(testDir);
  const prev = { ...first.added };

  // Simulate "changed" by bumping mtime on changer.xml
  const changerKey = Object.keys(prev).find(id => id.endsWith('changer.xml'));
  prev[changerKey] = {
    ...prev[changerKey],
    stat: { ...prev[changerKey].stat, mtimeMs: prev[changerKey].stat.mtimeMs + 1000 }
  };

  // Simulate "added" by removing lesson1.xml from prev
  const lessonKey = Object.keys(prev).find(id => id.endsWith('lesson1.xml'));
  delete prev[lessonKey];

  // Simulated deleted
  prev['file:///dummy/path/deleted.xml'] = {
    stat: { mtimeMs: 1, size: 10 },
    content: 'dummy'
  };

  // Second scan with mutated previous
  const second = await loadXmlFilesWithStats(testDir, prev);

  expect(Object.keys(second.unchanged).some(id => id.endsWith('simplecheck.xml'))).toBe(true);
  expect(Object.keys(second.changed).some(id => id.endsWith('changer.xml'))).toBe(true);
  expect(Object.keys(second.added).some(id => id.endsWith('lesson1.xml'))).toBe(true);
  expect(Object.keys(second.deleted).some(id => id.endsWith('lesson1.xml'))).toBe(false);
  expect(Object.keys(second.deleted)).toContain('file:///dummy/path/deleted.xml');
});
