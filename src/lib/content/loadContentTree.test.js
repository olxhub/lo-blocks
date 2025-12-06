// @vitest-environment node
// src/lib/content/loadContentTree.test.js
import fs from 'fs/promises';
import path from 'path';
import { fileTypes } from '../storage';
import { FileStorageProvider } from '../storage/providers/file';
import { syncContentFromStorage } from './syncContentFromStorage';

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

it('re-parses OLX files when their auxiliary dependencies change', async () => {
  // Use a temp directory inside content/ so it passes security checks
  const tmpDir = path.join(process.cwd(), 'content', '_test_dep_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Create a simple OLX file that references a .chatpeg file
    const olxContent = `<Chat id="test_chat_dep" src="dialogue.chatpeg" />`;
    // Note: chatpeg grammar requires trailing newline
    const chatpegContent = `Title: Test\n~~~~\nBob: Hello [id=msg1]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxContent);
    await fs.writeFile(path.join(tmpDir, 'dialogue.chatpeg'), chatpegContent);

    const provider = new FileStorageProvider(tmpDir);

    // First sync - parses both files
    const first = await syncContentFromStorage(provider);
    expect(first.idMap['test_chat_dep']).toBeDefined();

    // The Chat block's provenance should include both the OLX and chatpeg files
    const chatEntry = first.idMap['test_chat_dep'];
    expect(chatEntry.provenance).toBeDefined();
    expect(chatEntry.provenance.length).toBe(2);
    expect(chatEntry.provenance[0]).toContain('test.olx');
    expect(chatEntry.provenance[1]).toContain('dialogue.chatpeg');

    // Verify the first parse has the original title from the chatpeg header
    expect(chatEntry.kids.parsed.header.Title).toBe('Test');

    // Modify the .chatpeg file with different content
    const updatedChatpeg = `Title: Updated\n~~~~\nBob: Goodbye [id=msg2]\n`;
    await fs.writeFile(path.join(tmpDir, 'dialogue.chatpeg'), updatedChatpeg);

    // Second sync - should detect chatpeg change and re-parse the OLX
    const second = await syncContentFromStorage(provider);

    // The Chat block should still exist
    expect(second.idMap['test_chat_dep']).toBeDefined();

    // Verify the content was actually re-parsed - the title should have changed
    const updatedEntry = second.idMap['test_chat_dep'];
    expect(updatedEntry.kids.parsed.header.Title).toBe('Updated');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
