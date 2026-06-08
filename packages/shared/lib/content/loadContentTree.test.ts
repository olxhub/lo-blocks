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
    // Seed with files from content/demos and content/sba/psychology
    const seedFiles = [
      { src: 'content/demos/text-changer-demo.olx', dest: 'text-changer-demo.olx' },
      { src: 'content/demos/ref-demo.xml', dest: 'ref-demo.xml' },
      { src: 'content/sba/psychology/psychology_sba_part1.olx', dest: 'psychology_sba_part1.olx' },
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
    // Create a simple OLX file that references a .chatpeg file
    const olxContent = `<Chat id="test_chat_dep" src="dialogue.chatpeg" />`;
    // Note: chatpeg grammar requires trailing newline
    const chatpegContent = `Title: Test\n~~~~\nBob: Hello [id=msg1]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxContent);
    await fs.writeFile(path.join(tmpDir, 'dialogue.chatpeg'), chatpegContent);

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
    await fs.writeFile(path.join(tmpDir, 'dialogue.chatpeg'), updatedChatpeg);

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
  // Verifies that when an auxiliary file changes and causes a re-parse,
  // the blockIds array in parsedFiles is correctly updated to match the
  // new IDs in blockIndex.

  const tmpDir = path.join(process.cwd(), 'content', '_test_nodes_sync_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Create OLX with a Chat that has an id defined in the chatpeg
    const olxContent = `<Chat id="chat_main" src="convo.chatpeg" />`;
    // Initial chatpeg has one message with id "original_msg"
    const chatpegV1 = `Title: V1\n~~~~\nAlice: First message [id=original_msg]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxContent);
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV1);

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
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

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
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV3);

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

it('stale blockIds do not overwrite fresh IDs after auxiliary file change', async () => {
  // Tests that when both the OLX and its auxiliary file change simultaneously,
  // the blockIds list reflects the newly parsed blocks (not stale ones from
  // the previous parse).

  const tmpDir = path.join(process.cwd(), 'content', '_test_spread_order_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Initial OLX with one Chat block
    const olxV1 = `<vertical>
  <Chat id="chat1" src="convo.chatpeg" />
</vertical>`;
    const chatpegV1 = `Title: V1\n~~~~\nAlice: Hello [id=msg1]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxV1);
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV1);

    const provider = new FileStorageProvider(tmpDir);

    // First sync
    const first = await syncContentFromStorage(provider);

    const olxUri = Object.keys(first.parsed).find(k => k.endsWith('test.olx'));
    const firstNodes = first.parsed[olxUri].blockIds;

    // Should have chat1 (anonymous vertical doesn't get tracked by ID)
    expect(firstNodes).toContain(testKey('chat1'));
    const firstNodeCount = firstNodes.length;

    // Now: change BOTH the OLX (add new block) AND the chatpeg
    // The OLX file itself changes, so it goes to 'changed' directly
    // But this still exercises the code path where fileInfo might have old blockIds
    const olxV2 = `<vertical>
  <Chat id="chat1" src="convo.chatpeg" />
  <Markdown id="text_new">New text block</Markdown>
</vertical>`;
    const chatpegV2 = `Title: V2\n~~~~\nAlice: Goodbye [id=msg2]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxV2);
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

    // Second sync
    const second = await syncContentFromStorage(provider);

    const secondNodes = second.parsed[olxUri].blockIds;

    // Must have both chat1 AND text_new
    expect(secondNodes).toContain(testKey('chat1'));
    expect(secondNodes).toContain(testKey('text_new'));
    expect(getOlxJson(second.idMap, 'text_new')).toBeDefined();

    // Verify the chat was updated too
    expect(getOlxJson(second.idMap, 'chat1')?.kids?.parsed?.header?.Title).toBe('V2');

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('auxiliary-only change preserves correct blockIds', async () => {
  // When only the auxiliary file changes (OLX is unchanged), the OLX gets
  // promoted to "changed" for re-parsing. The blockIds in the result must
  // reflect the fresh parse, not stale IDs from the previous snapshot.

  const tmpDir = path.join(process.cwd(), 'content', '_test_aux_only_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const olxContent = `<Chat id="the_chat" src="convo.chatpeg" />`;
    const chatpegV1 = `Title: Version1\n~~~~\nAlice: Hi [id=m1]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxContent);
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV1);

    const provider = new FileStorageProvider(tmpDir);

    // First sync - establishes baseline
    const first = await syncContentFromStorage(provider);
    const olxUri = Object.keys(first.parsed).find(k => k.endsWith('test.olx'));

    // Record the exact blockIds array reference
    const nodesAfterFirst = [...first.parsed[olxUri].blockIds];
    expect(nodesAfterFirst).toContain(testKey('the_chat'));

    // ONLY change the chatpeg - OLX file stays unchanged
    const chatpegV2 = `Title: Version2\n~~~~\nAlice: Bye [id=m2]\n`;
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

    // Second sync - auxiliary change triggers re-parse of unchanged OLX
    const second = await syncContentFromStorage(provider);

    // Content should be updated
    expect(getOlxJson(second.idMap, 'the_chat')?.kids?.parsed?.header?.Title).toBe('Version2');

    // blockIds should be the fresh list from parseOLX, not stale from
    // the previous snapshot.
    const nodesAfterSecond = second.parsed[olxUri].blockIds;

    // They should be equivalent (same IDs) - if the bug exists, we might
    // see the old blockIds array object here
    expect(nodesAfterSecond).toContain(testKey('the_chat'));

    // Verify consistency by doing a THIRD sync where we delete the OLX
    await fs.rm(path.join(tmpDir, 'test.olx'));

    const third = await syncContentFromStorage(provider);

    // The chat should be GONE - if blockIds was stale, removal would have
    // used the wrong IDs and left orphans
    expect(getOlxJson(third.idMap, 'the_chat')).toBeUndefined();

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('blockIds is a new object after auxiliary-triggered reparse', async () => {
  // After a re-parse triggered by an auxiliary file change, blockIds should
  // be a fresh array, not the same reference as the previous snapshot's.

  const tmpDir = path.join(process.cwd(), 'content', '_test_nodes_identity_' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const olxContent = `<Chat id="identity_chat" src="convo.chatpeg" />`;
    const chatpegV1 = `Title: V1\n~~~~\nAlice: Hi [id=m1]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxContent);
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV1);

    const provider = new FileStorageProvider(tmpDir);

    // First sync
    const first = await syncContentFromStorage(provider);
    const olxUri = Object.keys(first.parsed).find(k => k.endsWith('test.olx'));

    // Get reference to the blockIds array
    const nodesArrayRef1 = first.parsed[olxUri].blockIds;

    // ONLY change the chatpeg
    const chatpegV2 = `Title: V2\n~~~~\nAlice: Bye [id=m2]\n`;
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

    // Second sync
    const second = await syncContentFromStorage(provider);

    const nodesArrayRef2 = second.parsed[olxUri].blockIds;

    // After a reparse, blockIds should be a new array from parseOLX,
    // not the same reference as the previous snapshot's.
    expect(nodesArrayRef2).not.toBe(nodesArrayRef1);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
