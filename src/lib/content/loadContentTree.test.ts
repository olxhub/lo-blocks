// @vitest-environment node
// src/lib/content/loadContentTree.test.js
import fs from 'fs/promises';
import path from 'path';
import { fileTypes } from '../lofs';
import { FileStorageProvider } from '../lofs/providers/file';
import { syncContentFromStorage } from './syncContentFromStorage';

// Helper to get OlxJson from idMap (language extraction happens in indexParsedBlocks)
// idMap now stores nested structure: { id: { locale: OlxJson } }
// For tests, use first available locale (same fallback as getBestLocale functions)
const getOlxJson = (idMap: any, id: string) => {
  const langMap = idMap[id];
  if (!langMap) return undefined;
  const locales = Object.keys(langMap);
  return locales.length > 0 ? langMap[locales[0]] : undefined;
};

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
    expect(getOlxJson(first.idMap, 'test_chat_dep')).toBeDefined();

    // The Chat block's provenance should include both the OLX and chatpeg files
    const chatEntry = getOlxJson(first.idMap, 'test_chat_dep');
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
    expect(getOlxJson(second.idMap, 'test_chat_dep')).toBeDefined();

    // Verify the content was actually re-parsed - the title should have changed
    const updatedEntry = getOlxJson(second.idMap, 'test_chat_dep');
    expect(updatedEntry?.kids?.parsed?.header?.Title).toBe('Updated');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('byProvenance.nodes stays in sync with byId when auxiliary files add/remove IDs', async () => {
  // This test verifies that when an auxiliary file changes and causes a re-parse,
  // the nodes array in byProvenance is correctly updated to match the new IDs.
  //
  // The bug: When moving an OLX from unchanged to changed, the old fileInfo
  // (which includes the stale nodes array) is spread AFTER setting nodes: ids,
  // causing the stale nodes to overwrite the fresh IDs.
  //
  // This causes deleteNodesByProvenance to use wrong IDs on subsequent updates.

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

    // Get the OLX file's provenance URI
    const olxUri = Object.keys(first.parsed).find(k => k.endsWith('test.olx'));
    expect(olxUri).toBeDefined();

    // Verify byProvenance.nodes contains the correct IDs after first parse
    const firstNodes = first.parsed[olxUri].nodes;
    expect(firstNodes).toContain('chat_main');

    // Now update the chatpeg to have a DIFFERENT message id
    // This simulates adding/removing block IDs via auxiliary file changes
    const chatpegV2 = `Title: V2\n~~~~\nAlice: Different message [id=new_msg]\n`;
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

    // Second sync - chatpeg changed, OLX should be re-parsed
    const second = await syncContentFromStorage(provider);

    // The chat_main block should still exist with updated content
    expect(getOlxJson(second.idMap, 'chat_main')).toBeDefined();
    expect(getOlxJson(second.idMap, 'chat_main')?.kids?.parsed?.header?.Title).toBe('V2');

    // CRITICAL CHECK: byProvenance.nodes must match what's actually in byId
    const secondNodes = second.parsed[olxUri].nodes;

    // The nodes array should reflect the current state
    expect(secondNodes).toContain('chat_main');

    // Every ID in nodes should exist in idMap
    for (const nodeId of secondNodes) {
    const nodeEntry = getOlxJson(second.idMap, nodeId);
      expect(nodeEntry).toBeDefined();
    }

    // Every ID in idMap that came from this file should be in nodes
    for (const [id, langMap] of Object.entries(second.idMap)) {
      const entry = (langMap as any)['en-Latn-US'];
      if (entry?.provenance && entry.provenance[0] === olxUri) {
        expect(secondNodes).toContain(id);
      }
    }

    // Now do a THIRD sync with another chatpeg change to verify cleanup works
    const chatpegV3 = `Title: V3\n~~~~\nAlice: Third version [id=third_msg]\n`;
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV3);

    const third = await syncContentFromStorage(provider);

    // Verify old IDs are properly cleaned up (not left as orphans in byId)
    // If the bug exists, deleteNodesByProvenance would use stale node IDs
    // and fail to remove the correct entries
    expect(getOlxJson(third.idMap, 'chat_main')).toBeDefined();
    expect(getOlxJson(third.idMap, 'chat_main')?.kids?.parsed?.header?.Title).toBe('V3');

    const thirdNodes = third.parsed[olxUri].nodes;

    // Again verify consistency
    for (const nodeId of thirdNodes) {
      expect(getOlxJson(third.idMap, nodeId)).toBeDefined();
    }

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('stale nodes array does not overwrite fresh IDs after auxiliary file change', async () => {
  // This directly tests the spread order bug:
  // { nodes: ids, ...fileInfo } - if fileInfo has nodes, it overwrites ids
  //
  // We verify this by:
  // 1. Creating an OLX with multiple blocks
  // 2. Changing auxiliary file (triggers re-parse via unchanged->changed move)
  // 3. Adding a NEW block to the OLX simultaneously
  // 4. Checking if the new block's ID appears in byProvenance.nodes

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
    const firstNodes = first.parsed[olxUri].nodes;

    // Should have chat1 (vertical is anonymous, doesn't get tracked by ID)
    expect(firstNodes).toContain('chat1');
    const firstNodeCount = firstNodes.length;

    // Now: change BOTH the OLX (add new block) AND the chatpeg
    // The OLX file itself changes, so it goes to 'changed' directly
    // But this still exercises the code path where fileInfo might have old nodes
    const olxV2 = `<vertical>
  <Chat id="chat1" src="convo.chatpeg" />
  <Text id="text_new">New text block</Text>
</vertical>`;
    const chatpegV2 = `Title: V2\n~~~~\nAlice: Goodbye [id=msg2]\n`;

    await fs.writeFile(path.join(tmpDir, 'test.olx'), olxV2);
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

    // Second sync
    const second = await syncContentFromStorage(provider);

    const secondNodes = second.parsed[olxUri].nodes;

    // Must have both chat1 AND text_new
    expect(secondNodes).toContain('chat1');
    expect(secondNodes).toContain('text_new');
    expect(getOlxJson(second.idMap, 'text_new')).toBeDefined();

    // Verify the chat was updated too
    expect(getOlxJson(second.idMap, 'chat1')?.kids?.parsed?.header?.Title).toBe('V2');

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('auxiliary-only change preserves correct nodes after spread', async () => {
  // This is the EXACT bug scenario:
  // 1. OLX file is UNCHANGED (goes to unchanged bucket)
  // 2. Auxiliary file changes (triggers move from unchanged to changed)
  // 3. The fileInfo from unchanged already has .nodes from previous parse
  // 4. After re-parse, { nodes: ids, ...fileInfo } overwrites fresh ids with stale nodes
  //
  // The symptom: after this, byProvenance[uri].nodes contains the OLD ids,
  // not the freshly parsed ones. On NEXT change, deleteNodesByProvenance
  // uses wrong IDs.

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

    // Record the exact nodes array reference/content
    const nodesAfterFirst = [...first.parsed[olxUri].nodes];
    expect(nodesAfterFirst).toContain('the_chat');

    // ONLY change the chatpeg - OLX file stays unchanged
    const chatpegV2 = `Title: Version2\n~~~~\nAlice: Bye [id=m2]\n`;
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

    // Second sync - auxiliary change triggers re-parse of unchanged OLX
    const second = await syncContentFromStorage(provider);

    // Content should be updated
    expect(getOlxJson(second.idMap, 'the_chat')?.kids?.parsed?.header?.Title).toBe('Version2');

    // HERE'S THE BUG CHECK:
    // The nodes array in byProvenance should be the FRESH one from parseOLX,
    // not the stale one from the fileInfo that was spread over it.
    const nodesAfterSecond = second.parsed[olxUri].nodes;

    // They should be equivalent (same IDs) - if the bug exists, we might
    // see the old nodes array object here
    expect(nodesAfterSecond).toContain('the_chat');

    // More importantly: verify the internal contentStore is consistent
    // by doing a THIRD sync where we delete the OLX
    await fs.rm(path.join(tmpDir, 'test.olx'));

    const third = await syncContentFromStorage(provider);

    // The chat should be GONE - if nodes was stale, deleteNodesByProvenance
    // might have tried to delete wrong IDs and left orphans
    expect(getOlxJson(third.idMap, 'the_chat')).toBeUndefined();

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

it('nodes array is fresh after auxiliary-triggered reparse (spread order bug)', async () => {
  // This test demonstrates the spread order bug in syncContentFromStorage.
  //
  // The bug: At line 148-151, the code does:
  //   contentStore.byProvenance[uri] = { nodes: ids, ...fileInfo }
  //
  // When an auxiliary file changes and an OLX is moved from unchanged to changed,
  // fileInfo contains the OLD nodes array (from the previous parse stored in
  // contentStore.byProvenance). Because ...fileInfo comes AFTER nodes: ids,
  // the stale fileInfo.nodes OVERWRITES the fresh ids.
  //
  // The fix: Swap the spread order:
  //   contentStore.byProvenance[uri] = { ...fileInfo, nodes: ids }
  //
  // This test verifies the nodes array is a NEW object after reparse.
  // If the bug exists, nodesArrayRef2 === nodesArrayRef1 (same object reference).

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

    // Get reference to the nodes array
    const nodesArrayRef1 = first.parsed[olxUri].nodes;

    // ONLY change the chatpeg
    const chatpegV2 = `Title: V2\n~~~~\nAlice: Bye [id=m2]\n`;
    await fs.writeFile(path.join(tmpDir, 'convo.chatpeg'), chatpegV2);

    // Second sync
    const second = await syncContentFromStorage(provider);

    const nodesArrayRef2 = second.parsed[olxUri].nodes;

    // THE KEY CHECK: After a reparse, nodes should be a NEW array from parseOLX,
    // not the same object reference that was in the old fileInfo.
    //
    // If the bug exists (spread overwrites nodes), nodesArrayRef2 === nodesArrayRef1
    // because the stale fileInfo.nodes (which IS nodesArrayRef1) gets spread over.
    //
    // If fixed correctly, nodesArrayRef2 should be a different array object
    // (even if it has the same contents).
    expect(nodesArrayRef2).not.toBe(nodesArrayRef1);

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
