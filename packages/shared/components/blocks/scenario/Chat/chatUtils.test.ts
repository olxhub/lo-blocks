// @vitest-environment node
// src/components/blocks/Chat/chatUtils.test.ts

import { describe, it, expect } from 'vitest';
import { clip, section, byId, listSections, listIds } from './chatUtils';
import { parse as parseChat } from './_chatParser';

// Shared conversation used by most tests
const conv = parseChat(`Title: Test
~~~~

Introduction [id=intro]
------------

Alex: Hello [id=greeting]
Sam: How are you?
`);

/* ── Indented rich content ─────────────────────────────────────────────── */

describe('indented rich content', () => {
  it('parses indented block as part of speaker text', () => {
    const result = parseChat(`~~~~
Kim: Here is what I found:

  The results were striking:

  - Testing improved retention by 50%
  - Re-reading only improved it by 20%

Alex: Wow!
`);
    const kim = result.body[0];
    expect(kim.type).toBe('Line');
    expect(kim.speaker).toBe('Kim');
    expect(kim.text).toContain('Here is what I found:');
    expect(kim.text).toContain('- Testing improved retention by 50%');
    expect(kim.text).toContain('- Re-reading only improved it by 20%');
    // Should have paragraph break between inline text and indented block
    expect(kim.text).toContain('found:\n\nThe results');

    const alex = result.body[1];
    expect(alex.speaker).toBe('Alex');
    expect(alex.text).toBe('Wow!');
  });

  it('preserves blank lines within indented block as paragraph breaks', () => {
    const result = parseChat(`~~~~
Kim: Summary:

  First paragraph.

  Second paragraph.

Alex: Got it.
`);
    const kim = result.body[0];
    expect(kim.text).toContain('First paragraph.\n\nSecond paragraph.');
  });

  it('treats # and [ as literal text inside indented blocks', () => {
    const result = parseChat(`~~~~
Kim: Notes:

  # This is a heading
  [This is bracketed text]

Alex: Thanks.
`);
    const kim = result.body[0];
    expect(kim.text).toContain('# This is a heading');
    expect(kim.text).toContain('[This is bracketed text]');
  });

  it('ends indented block at non-indented content', () => {
    const result = parseChat(`~~~~
Kim: Intro:

  Indented content here.

Sam: Next speaker.
`);
    expect(result.body).toHaveLength(2);
    expect(result.body[0].speaker).toBe('Kim');
    expect(result.body[1].speaker).toBe('Sam');
  });

  it('works with continuation lines before indented block', () => {
    const result = parseChat(`~~~~
Kim: This is a long message that
continues on the next line.

  And then has an indented block.

Alex: Ok.
`);
    const kim = result.body[0];
    expect(kim.text).toContain('continues on the next line.');
    expect(kim.text).toContain('And then has an indented block.');
  });

  it('does not affect existing non-indented continuation lines', () => {
    const result = parseChat(`~~~~
Kim: This is a message
that continues without indentation
across multiple lines.
Alex: Reply.
`);
    const kim = result.body[0];
    expect(kim.text).toBe('This is a message\nthat continues without indentation\nacross multiple lines.');
  });
});

describe('chatUtils', () => {
  describe('byId', () => {
    it('finds elements by ID (message or section)', () => {
      expect(byId(conv, 'greeting')).toBe(1);
      expect(byId(conv, 'intro')).toEqual({ start: 0, end: 2 });
    });

    it('returns false for non-existent IDs', () => {
      expect(byId(conv, 'nonexistent')).toBe(false);
    });
  });

  describe('listSections / listIds', () => {
    it('lists section headers and all IDs', () => {
      const sections = listSections(conv);
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe('Introduction');

      const ids = listIds(conv);
      expect(ids).toContain('intro');
      expect(ids).toContain('greeting');
    });
  });

  describe('section', () => {
    it('finds section ranges by title', () => {
      expect(section(conv, 'Introduction')).toEqual({ start: 0, end: 2 });
    });

    it('returns null for non-existent sections', () => {
      expect(section(conv, 'Nonexistent')).toBeNull();
    });
  });

  describe('clip', () => {
    it('resolves numeric index', () => {
      expect(clip(conv, '2')).toEqual({ start: 2, end: 2, valid: true, message: null });
    });

    it('resolves section names (quoted and unquoted)', () => {
      const expected = { start: 0, end: 2, valid: true, message: null };
      expect(clip(conv, '"Introduction"')).toEqual(expected);
      expect(clip(conv, 'Introduction')).toEqual(expected);
    });

    it('resolves IDs (quoted and unquoted)', () => {
      const expected = { start: 1, end: 1, valid: true, message: null };
      expect(clip(conv, 'greeting')).toEqual(expected);
      expect(clip(conv, '"greeting"')).toEqual(expected);
    });

    it('resolves section header IDs as full section', () => {
      // 'intro' is the ID on the section header — returns the whole section
      expect(clip(conv, 'intro')).toEqual({ start: 0, end: 2, valid: true, message: null });
    });

    it('handles section names with spaces', () => {
      const spacedConv = parseChat(`Title: Test\n~~~~\n\nMain Section [id=main]\n------------\n\nAlex: Content here\n`);
      expect(clip(spacedConv, 'Main Section')).toEqual({ start: 0, end: 1, valid: true, message: null });
    });

    it('distinguishes section names from IDs when they conflict', () => {
      const conflictConv = parseChat(`Title: Conflict Test\n~~~~\n\nTest Section\n------------\n\nAlex: This has a conflicting ID [id=Test]\nJordan: Another message\n`);
      expect(clip(conflictConv, 'Test Section')).toEqual({ start: 0, end: 2, valid: true, message: null });
      expect(clip(conflictConv, 'Test')).toEqual({ start: 1, end: 1, valid: true, message: null });
    });

    describe('range clips', () => {
      it('handles numeric ranges with different bracket types', () => {
        expect(clip(conv, '[0, 2]')).toEqual({ start: 0, end: 2, valid: true, message: null });
        expect(clip(conv, '(0, 2)')).toEqual({ start: 1, end: 1, valid: true, message: null });
        expect(clip(conv, '[0, 2)')).toEqual({ start: 0, end: 1, valid: true, message: null });
      });

      it('handles open and half-open ranges', () => {
        expect(clip(conv, '[1,]')).toEqual({ start: 1, end: 2, valid: true, message: null });
        expect(clip(conv, '[,1]')).toEqual({ start: 0, end: 1, valid: true, message: null });
      });

      it('handles IDs in ranges', () => {
        expect(clip(conv, '[intro, greeting]')).toEqual({ start: 0, end: 1, valid: true, message: null });
      });
    });

    describe('error handling', () => {
      it('throws for unknown section/ID names with helpful message', () => {
        expect(() => clip(conv, 'BadSection')).toThrow(/Unknown section or ID/);
        // Error message includes available options
        try { clip(conv, 'BadSection'); } catch (e) {
          expect(e.message).toContain('Available sections:');
          expect(e.message).toContain('Introduction');
          expect(e.message).toContain('Available IDs:');
        }
      });

      it('throws for invalid syntax and invalid ranges', () => {
        expect(() => clip(conv, '[[[')).toThrow(/Clip syntax error/);
        expect(() => clip(conv, '[5, 2]')).toThrow(/Invalid clip range/);
      });
    });

    describe('edge cases', () => {
      it('handles minimal conversation', () => {
        const minConv = parseChat(`~~~~\nAlex: Hi there\n`);
        const result = clip(minConv, '[,]');
        expect(result).toMatchObject({ start: 0, end: 0, valid: true });
      });

      it('handles conversations with only headers', () => {
        const headerConv = parseChat(`~~~~\nSection One\n-----------\n\nSection Two\n-----------\n`);
        expect(clip(headerConv, '"Section One"')).toEqual({ start: 0, end: 0, valid: true, message: null });
      });

      it('handles special characters in IDs', () => {
        const specialConv = parseChat(`~~~~\n[id=test-id-123]\nAlex: Test with special ID\n`);
        expect(clip(specialConv, 'test-id-123')).toEqual({ start: 0, end: 0, valid: true, message: null });
      });
    });
  });
});
