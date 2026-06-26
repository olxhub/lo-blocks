// @vitest-environment node
// packages/shared/components/blocks/scenario/Chat/setCommand.test.ts
//
// Grammar coverage for the `lhs <- value` set command (chat.pegjs SetCommand).
// The arrow points INTO the destination (assignment); the field defaults to
// `value`, and leading dots encode scope (named ref / self `.` / parent `..`).

import { describe, it, expect } from 'vitest';
import { parse as parseChat } from './_chatParser';

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
