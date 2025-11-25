// @vitest-environment node
// src/lib/content/loadContentTree.test.js
import fs from 'fs/promises';
import path from 'path';
import { FileStorageProvider, fileTypes } from '../storage';

it('handles added, unchanged, changed, and deleted files via filesystem mutation', async () => {
  const tmpDir = await fs.mkdtemp('content-test-');

  // Seed with three XML files
  const seedFiles = ['changer.xml', 'helloaction.xml', 'simplecheck.xml'];
  for (const file of seedFiles) {
    await fs.copyFile(path.join('content/demos', file), path.join(tmpDir, file));
  }

  const provider = new FileStorageProvider(tmpDir);
  const first = await provider.loadXmlFilesWithStats();
  for (const info of Object.values(first.added)) {
    expect(info.type).toBe(fileTypes.xml);
  }
  const prev = { ...first.added };

  // Mutate: modify changer.xml
  await fs.appendFile(path.join(tmpDir, 'changer.xml'), ' ');
  // Add lesson1.xml
  await fs.copyFile(
    path.join('content/linear-algebra/eigenvalues/lesson1.xml'),
    path.join(tmpDir, 'lesson1.xml')
  );
  // Delete helloaction.xml
  await fs.rm(path.join(tmpDir, 'helloaction.xml'));

  const second = await provider.loadXmlFilesWithStats(prev);

  for (const info of Object.values(second.added)) {
    expect(info.type).toBe(fileTypes.xml);
  }

  expect(Object.keys(second.unchanged).some(id => id.endsWith('simplecheck.xml'))).toBe(true);
  expect(Object.keys(second.changed).some(id => id.endsWith('changer.xml'))).toBe(true);
  expect(Object.keys(second.added).some(id => id.endsWith('lesson1.xml'))).toBe(true);
  expect(Object.keys(second.deleted).some(id => id.endsWith('helloaction.xml'))).toBe(true);

  await fs.rm(tmpDir, { recursive: true, force: true });
});
