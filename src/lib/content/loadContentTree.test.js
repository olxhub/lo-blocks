// @vitest-environment node
// src/lib/content/loadContentTree.test.js
import fs from 'fs/promises';
import path from 'path';
import { fileTypes } from '../storage';
import { FileStorageProvider } from '../storage/providers/file';

it('handles added, unchanged, changed, and deleted files via filesystem mutation', async () => {
  const tmpDir = await fs.mkdtemp('content-test-');

  // Seed with files from content/demos and content/sba/psychology
  const seedFiles = [
    { src: 'content/demos/text-changer-demo.olx', dest: 'text-changer-demo.olx' },
    { src: 'content/demos/ref-demo.xml', dest: 'ref-demo.xml' },
    { src: 'content/sba/psychology/psychology_sba.olx', dest: 'psychology_sba.olx' },
  ];
  for (const { src, dest } of seedFiles) {
    await fs.copyFile(src, path.join(tmpDir, dest));
  }

  const provider = new FileStorageProvider(tmpDir);
  const first = await provider.loadXmlFilesWithStats();
  for (const info of Object.values(first.added)) {
    expect([fileTypes.xml, fileTypes.olx]).toContain(info.type);
  }
  const prev = { ...first.added };

  // Mutate: modify text-changer-demo.olx
  await fs.appendFile(path.join(tmpDir, 'text-changer-demo.olx'), ' ');
  // Add learning-observer-course.olx from content root
  await fs.copyFile(
    'content/learning-observer-course.olx',
    path.join(tmpDir, 'learning-observer-course.olx')
  );
  // Delete ref-demo.xml
  await fs.rm(path.join(tmpDir, 'ref-demo.xml'));

  const second = await provider.loadXmlFilesWithStats(prev);

  for (const info of Object.values(second.added)) {
    expect([fileTypes.xml, fileTypes.olx]).toContain(info.type);
  }

  expect(Object.keys(second.unchanged).some(id => id.endsWith('psychology_sba.olx'))).toBe(true);
  expect(Object.keys(second.changed).some(id => id.endsWith('text-changer-demo.olx'))).toBe(true);
  expect(Object.keys(second.added).some(id => id.endsWith('learning-observer-course.olx'))).toBe(true);
  expect(Object.keys(second.deleted).some(id => id.endsWith('ref-demo.xml'))).toBe(true);

  await fs.rm(tmpDir, { recursive: true, force: true });
});
