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
