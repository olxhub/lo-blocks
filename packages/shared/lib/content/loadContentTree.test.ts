// @vitest-environment node
// packages/shared/lib/content/loadContentTree.test.ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileTypes } from '../lofs';
import { FileStorageProvider } from '../lofs/providers/file';
import { syncContentFromStorage } from './syncContentFromStorage';
import { getOlxJson, TEST_NS, testKey } from '../test-utils';
import { asDefinitionKey } from '../types/id-grammar';
import { withoutVersion } from '../types/address';

it('handles added, unchanged, changed, and deleted files via filesystem mutation', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-test-'));

  try {
    // Seed with files from content/demos and content/psychology
    const seedFiles = [
      { src: 'content/demos/text-changer-demo.olx', dest: 'text-changer-demo.olx' },
      { src: 'content/demos/ref-demo.xml', dest: 'ref-demo.xml' },
      { src: 'content/psychology/psychology_sba_part1.olx', dest: 'psychology_sba_part1.olx' },
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
    // Add learning-observer-course.olx
    await fs.copyFile(
      'content/demos/learning-observer-course.olx',
      path.join(tmpDir, 'learning-observer-course.olx')
    );
    // Delete ref-demo.xml
    await fs.rm(path.join(tmpDir, 'ref-demo.xml'));

    const second = await provider.loadXmlFilesWithStats(prev);

    for (const info of Object.values(second.added)) {
      expect([fileTypes.xml, fileTypes.olx]).toContain(info.type);
    }

    expect(Object.keys(second.unchanged).some(id => id.endsWith('psychology_sba_part1.olx'))).toBe(true);
    expect(Object.keys(second.changed).some(id => id.endsWith('text-changer-demo.olx'))).toBe(true);
    expect(Object.keys(second.added).some(id => id.endsWith('learning-observer-course.olx'))).toBe(true);
    expect(Object.keys(second.deleted).some(id => id.endsWith('ref-demo.xml'))).toBe(true);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('re-parses OLX files when their auxiliary dependencies change', async () => {
  // Use a temp directory inside content/ so it passes security checks
  const tmpDir = path.join(process.cwd(), 'content', '_test_dep_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Create a simple OLX file that references a .chatpeg file.
    // Files live in a CONTENT/ subdirectory: the top-level directory name is
    // the content namespace, and "CONTENT" matches TEST_NS so the unqualified
    // getOlxJson/testKey helpers line up.
    const olxDir = path.join(tmpDir, 'CONTENT');
    await fs.mkdir(olxDir, { recursive: true });
    const olxContent = `<Chat id="test_chat_dep" src="dialogue.chatpeg" />`;
    // Note: chatpeg grammar requires trailing newline
    const chatpegContent = `Title: Test\n~~~~\nBob: Hello [id=msg1]\n`;

    await fs.writeFile(path.join(olxDir, 'test.olx'), olxContent);
    await fs.writeFile(path.join(olxDir, 'dialogue.chatpeg'), chatpegContent);

    const provider = new FileStorageProvider(tmpDir);

    // First sync - parses both files
    const first = await syncContentFromStorage(provider);
    expect(getOlxJson(first.idMap, 'test_chat_dep')).toBeDefined();

    // The Chat block's source should be the OLX file and parseDeps should include the chatpeg
    const chatEntry = getOlxJson(first.idMap, 'test_chat_dep');
    expect(chatEntry.source).toBeDefined();
    expect(chatEntry.source).toContain('test.olx');
    expect(chatEntry.parseDeps).toBeDefined();
    expect(chatEntry.parseDeps.length).toBe(1);
    expect(chatEntry.parseDeps[0]).toContain('dialogue.chatpeg');

    // Verify the first parse has the original title from the chatpeg header
    expect(chatEntry.kids.parsed.header.Title).toBe('Test');

    // Modify the .chatpeg file with different content
    const updatedChatpeg = `Title: Updated\n~~~~\nBob: Goodbye [id=msg2]\n`;
    await fs.writeFile(path.join(olxDir, 'dialogue.chatpeg'), updatedChatpeg);

    // Second sync - should detect chatpeg change and re-parse the OLX
    const second = await syncContentFromStorage(provider);

    // The Chat block should still exist
    expect(getOlxJson(second.idMap, 'test_chat_dep')).toBeDefined();

    // Verify the content was actually re-parsed - the title should have changed
    const updatedEntry = getOlxJson(second.idMap, 'test_chat_dep');
    expect(updatedEntry?.kids?.parsed?.header?.Title).toBe('Updated');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('parsed blockIds stay in sync with blockIndex when auxiliary files add/remove IDs', async () => {
  // Regression: the old mutable-singleton architecture had a spread-order
  // bug where moving an OLX from "unchanged" to "changed" carried stale
  // blockIds from the previous parse, causing the removal step to use
  // wrong IDs on subsequent updates. The functional rewrite prevents this
  // structurally (new snapshot = new blockIds), but we keep the test
  // because the invariant — blockIds matches what's actually in blockIndex —
  // is worth verifying regardless of implementation.

  const tmpDir = path.join(process.cwd(), 'content', '_test_nodes_sync_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Create OLX with a Chat that has an id defined in the chatpeg.
    // CONTENT/ subdirectory = namespace, matching TEST_NS (see above).
    const olxDir = path.join(tmpDir, 'CONTENT');
    await fs.mkdir(olxDir, { recursive: true });
    const olxContent = `<Chat id="chat_main" src="convo.chatpeg" />`;
    // Initial chatpeg has one message with id "original_msg"
    const chatpegV1 = `Title: V1\n~~~~\nAlice: First message [id=original_msg]\n`;

    await fs.writeFile(path.join(olxDir, 'test.olx'), olxContent);
    await fs.writeFile(path.join(olxDir, 'convo.chatpeg'), chatpegV1);

    const provider = new FileStorageProvider(tmpDir);

    // First sync
    const first = await syncContentFromStorage(provider);
    expect(getOlxJson(first.idMap, 'chat_main')).toBeDefined();

    // Get the OLX file's URI
    const olxUri = Object.keys(first.parsed).find(k => k.endsWith('test.olx'));
    expect(olxUri).toBeDefined();

    // Verify blockIds contains the correct IDs after first parse
    const firstNodes = first.parsed[olxUri].blockIds;
    expect(firstNodes).toContain(testKey('chat_main'));

    // Now update the chatpeg to have a DIFFERENT message id
    // This simulates adding/removing block IDs via auxiliary file changes
    const chatpegV2 = `Title: V2\n~~~~\nAlice: Different message [id=new_msg]\n`;
    await fs.writeFile(path.join(olxDir, 'convo.chatpeg'), chatpegV2);

    // Second sync - chatpeg changed, OLX should be re-parsed
    const second = await syncContentFromStorage(provider);

    // The chat_main block should still exist with updated content
    expect(getOlxJson(second.idMap, 'chat_main')).toBeDefined();
    expect(getOlxJson(second.idMap, 'chat_main')?.kids?.parsed?.header?.Title).toBe('V2');

    // CRITICAL CHECK: blockIds must match what's actually in blockIndex
    const secondNodes = second.parsed[olxUri].blockIds;

    // The blockIds array should reflect the current state
    expect(secondNodes).toContain(testKey('chat_main'));

    // Every ID in blockIds should exist in idMap
    for (const nodeId of secondNodes) {
    const nodeEntry = getOlxJson(second.idMap, nodeId);
      expect(nodeEntry).toBeDefined();
    }

    // Every ID in idMap that came from this file should be in blockIds
    for (const [id, variantMap] of Object.entries(second.idMap) as [DefinitionKey, IdMap[DefinitionKey]][]) {
      const entry = variantMap['*' as ContentVariant];
      if (entry?.source && withoutVersion(entry.source) === olxUri) {
        expect(secondNodes).toContain(id);
      }
    }

    // Now do a THIRD sync with another chatpeg change to verify cleanup works
    const chatpegV3 = `Title: V3\n~~~~\nAlice: Third version [id=third_msg]\n`;
    await fs.writeFile(path.join(olxDir, 'convo.chatpeg'), chatpegV3);

    const third = await syncContentFromStorage(provider);

    // Verify old IDs are properly cleaned up (not left as orphans in byId)
    // If blockIds were stale, removal would use wrong IDs and leave orphans
    expect(getOlxJson(third.idMap, 'chat_main')).toBeDefined();
    expect(getOlxJson(third.idMap, 'chat_main')?.kids?.parsed?.header?.Title).toBe('V3');

    const thirdNodes = third.parsed[olxUri].blockIds;

    // Again verify consistency
    for (const nodeId of thirdNodes) {
      expect(getOlxJson(third.idMap, nodeId)).toBeDefined();
    }

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

