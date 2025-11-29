// @vitest-environment node
// src/lib/content/loadContentTree.test.js
import fs from 'fs/promises';
import path from 'path';
import { fileTypes } from '../storage';
import { FileStorageProvider } from '../storage/providers/file';

it('handles added, unchanged, changed, and deleted files via filesystem mutation', async () => {
  const tmpDir = await fs.mkdtemp('content-test-');

  // Seed with three XML files from content/demos
  const seedFiles = ['changer.xml', 'ref-demo.xml', 'course-demo.xml'];
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
  // Add another file from content/sba
  await fs.copyFile(
    path.join('content/sba/sba_holder.xml'),
    path.join(tmpDir, 'sba_holder.xml')
  );
  // Delete ref-demo.xml
  await fs.rm(path.join(tmpDir, 'ref-demo.xml'));

  const second = await provider.loadXmlFilesWithStats(prev);

  for (const info of Object.values(second.added)) {
    expect(info.type).toBe(fileTypes.xml);
  }

  expect(Object.keys(second.unchanged).some(id => id.endsWith('course-demo.xml'))).toBe(true);
  expect(Object.keys(second.changed).some(id => id.endsWith('changer.xml'))).toBe(true);
  expect(Object.keys(second.added).some(id => id.endsWith('sba_holder.xml'))).toBe(true);
  expect(Object.keys(second.deleted).some(id => id.endsWith('ref-demo.xml'))).toBe(true);

  await fs.rm(tmpDir, { recursive: true, force: true });
});
