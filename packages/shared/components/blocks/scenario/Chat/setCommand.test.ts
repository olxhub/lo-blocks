// @vitest-environment node
// packages/shared/components/blocks/scenario/Chat/setCommand.test.ts
//
// Grammar coverage for the `lhs <- value` set command (chat.pegjs SetCommand).
// The arrow points INTO the destination (assignment); the field defaults to
// `value`, and leading dots encode scope (named ref / self `.` / parent `..`).

import { describe, it, expect } from 'vitest';
import { parse as parseChat } from './_chatParser';
import { parseOLX } from '@/lib/content/parseOLX';
import { collectBlockWithKids } from '@/lib/content/collectBlockWithKids';
import { toMemoryRef } from '@/lib/types/storage';
import { TEST_NS, testKey } from '@/lib/test-utils';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { extractAttributes } from '@/lib/docs/schemaUtils';
import { generateOlxSchema } from '@/components/common/CodeEditor/olxSchema';

const entriesOf = (src: string) => (parseChat(src + '\n') as any).body;
const firstSet = (src: string) => entriesOf(src)[0];

describe('SetCommand parsing', () => {
  it('named ref defaults the field to value', () => {
    expect(firstSet('sidebar <- intro_panel')).toEqual({
      type: 'SetField', scope: 'ref', ref: 'sidebar', field: 'value', value: 'intro_panel',
    });
  });

  it('named ref with an explicit field', () => {
    expect(firstSet('useElement.target <- Boo')).toEqual({
      type: 'SetField', scope: 'ref', ref: 'useElement', field: 'target', value: 'Boo',
    });
  });

  it('self scope via a single leading dot', () => {
    expect(firstSet('.mode <- chat')).toEqual({
      type: 'SetField', scope: 'self', ref: null, field: 'mode', value: 'chat',
    });
  });

  it('parent scope via a double leading dot', () => {
    expect(firstSet('..mode <- activity')).toEqual({
      type: 'SetField', scope: 'parent', ref: null, field: 'mode', value: 'activity',
    });
  });

  it('decodes escapes in a quoted string value', () => {
    const cmd = firstSet('text.value <- "Line one\\n\\nA \\"quoted\\" word."');
    expect(cmd.value).toBe('Line one\n\nA "quoted" word.');
  });

  it('leaves an arrow inside dialogue text as a literal Line', () => {
    const entry = firstSet('Lin: write A -> B -> C as a sequence.');
    expect(entry.type).toBe('Line');
    expect(entry.text).toContain('A -> B -> C');
  });
});

describe('set targets are loaded, not contained', () => {
  const xml = `<Vertical id="root">
  <Chat id="chat"><![CDATA[
Lin: hello
board_ready <- go
]]></Chat>
  <LineInput id="board_ready" />
</Vertical>`;

  it('lifts named-ref set targets into the ref-preloading channel', async () => {
    const { idMap } = await parseOLX(xml, [toMemoryRef('set.xml')], undefined, TEST_NS);
    const chatKey = testKey('chat');
    const entry = idMap[chatKey]!['*' as keyof typeof idMap[typeof chatKey]] as any;

    // Ref-typed attribute (getRefAttributes) — the LOADING channel. Injected by
    // the parser, so it is unaffected by parseOLX's rejection of AUTHORED
    // "_"-prefixed attributes (see parseOLX.test.ts).
    expect(entry.attributes._setTargets.map(String)).toEqual(['board_ready']);
    // NOT a structural kid: staticKids feeds containment traversals.
    expect(BLOCK_REGISTRY['Chat'].staticKids!(entry)).toEqual([]);
    // Net effect: the target ships with the chat.
    expect(Object.keys(collectBlockWithKids(idMap, chatKey, null)))
      .toContain(testKey('board_ready'));
  });

  it('keeps the parse-time attribute out of docs and editor autocomplete', () => {
    const chat = BLOCK_REGISTRY['Chat'];
    expect(extractAttributes(chat.attributes)!.map(a => a.name)).not.toContain('_setTargets');
    const { attributes } = generateOlxSchema({ Chat: chat } as any);
    expect(attributes.map(a => a.name)).not.toContain('_setTargets');
  });
});
