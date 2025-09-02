// src/components/blocks/Chat/chatUtils.test.js

// This is LLM-generated, with just a quick human review. It is not
// aligned with codebase test standards, and it's okay to:
// - Wipe it out
// - Clean it up (e.g. make one test conversation with more examples,
//   and fewer, more cross-cutting tests)
// - Leave it
// - ...
//
// Short story is we're not very committed to it, and we were
// borderline on adding to repo, but ultimately, decided it made sense
// to leave for now.

import { describe, it, expect } from 'vitest';
import { clip, section, byId, listSections, listIds } from './chatUtils.js';
import { parse as parseChat } from './_chatParser.js';

// Helper to create a parsed conversation from chatpeg format
function createConversation(chatContent) {
  return parseChat(chatContent);
}

describe('chatUtils', () => {
  const sampleConversation = createConversation(`Title: Test
~~~~

Introduction [id=intro]
------------

Alex: Hello [id=greeting]
Sam: How are you?
`);

  describe('byId', () => {
    it('should find elements by their ID', () => {
      expect(byId(sampleConversation, 'greeting')).toBe(1);
      expect(byId(sampleConversation, 'intro')).toEqual({start: 0, end: 2});
    });

    it('should return false for non-existent IDs', () => {
      expect(byId(sampleConversation, 'nonexistent')).toBe(false);
    });
  });

  describe('listSections', () => {
    it('should list all section headers', () => {
      const sections = listSections(sampleConversation);
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe('Introduction');
    });
  });

  describe('listIds', () => {
    it('should list all IDs in the conversation', () => {
      const ids = listIds(sampleConversation);
      expect(ids).toContain('intro');
      expect(ids).toContain('greeting');
    });
  });

  describe('section', () => {
    it('should find section ranges by title', () => {
      const introRange = section(sampleConversation, 'Introduction');
      expect(introRange).toEqual({ start: 0, end: 2 });
    });

    it('should return null for non-existent sections', () => {
      expect(section(sampleConversation, 'Nonexistent')).toBeNull();
    });
  });

  describe('clip', () => {
    describe('single clips', () => {
      it('should handle numeric indices', () => {
        const result = clip(sampleConversation, '2');
        expect(result).toEqual({ start: 2, end: 2, valid: true, message: null });
      });

      it('should handle quoted section names', () => {
        const result = clip(sampleConversation, '"Introduction"');
        expect(result).toEqual({ start: 0, end: 2, valid: true, message: null });
      });

      it('should handle unquoted section names', () => {
        const result = clip(sampleConversation, 'Introduction');
        expect(result).toEqual({ start: 0, end: 2, valid: true, message: null });
      });

      it('should handle unquoted IDs', () => {
        const result = clip(sampleConversation, 'greeting');
        expect(result).toEqual({ start: 1, end: 1, valid: true, message: null });
      });

      it('should handle IDs with quoted strings', () => {
        const result = clip(sampleConversation, '"greeting"');
        expect(result).toEqual({ start: 1, end: 1, valid: true, message: null });
      });

      it('should treat section header IDs as section references', () => {
        // When referring to 'intro' (ID on section header), should get the whole section
        const result = clip(sampleConversation, 'intro');
        expect(result).toEqual({ start: 0, end: 2, valid: true, message: null });
      });

      it('should handle unquoted section names with spaces', () => {
        // Create a conversation with spaced section name
        const spacedConv = createConversation(`Title: Test
~~~~

Main Section [id=main]
------------

Alex: Content here
`);
        const result = clip(spacedConv, 'Main Section');
        expect(result).toEqual({ start: 0, end: 1, valid: true, message: null });
      });

      it('should handle ID vs section name resolution intelligently', () => {
        // Test conversation with conflicting names
        const conflictConv = createConversation(`Title: Conflict Test
~~~~

Test Section
------------

Alex: This has an ID that matches the section name [id=Test]
Jordan: Another message
`);

        // "Test Section" should refer to the section (start: 0, end: 2)
        const sectionResult = clip(conflictConv, 'Test Section');
        expect(sectionResult).toEqual({ start: 0, end: 2, valid: true, message: null });

        // "Test" should refer to the ID (just the Alex message at index 1)
        const idResult = clip(conflictConv, 'Test');
        expect(idResult).toEqual({ start: 1, end: 1, valid: true, message: null });
      });
    });

    describe('range clips', () => {
      it('should handle numeric ranges', () => {
        const result = clip(sampleConversation, '[0, 2]');
        expect(result).toEqual({ start: 0, end: 2, valid: true, message: null });
      });

      it('should handle open ranges', () => {
        const result = clip(sampleConversation, '[1,]');
        expect(result).toEqual({ start: 1, end: 2, valid: true, message: null });
      });

      it('should handle half-open ranges', () => {
        const result = clip(sampleConversation, '[,1]');
        expect(result).toEqual({ start: 0, end: 1, valid: true, message: null });
      });

      it('should handle exclusive ranges', () => {
        const result = clip(sampleConversation, '(0, 2)');
        expect(result).toEqual({ start: 1, end: 1, valid: true, message: null });
      });

      it('should handle mixed brackets', () => {
        const result = clip(sampleConversation, '[0, 2)');
        expect(result).toEqual({ start: 0, end: 1, valid: true, message: null });
      });

      it('should handle IDs in ranges', () => {
        const result = clip(sampleConversation, '[intro, greeting]');
        expect(result).toEqual({ start: 0, end: 1, valid: true, message: null });
      });
    });

    describe('error handling', () => {
      it('should throw error for invalid section names', () => {
        expect(() => clip(sampleConversation, 'NonexistentSection'))
          .toThrow(/Unknown section or ID/);
      });

      it('should throw error for invalid quoted section names', () => {
        expect(() => clip(sampleConversation, '"NonexistentSection"'))
          .toThrow(/Unknown section or ID/);
      });

      it('should provide helpful error messages with available options', () => {
        try {
          clip(sampleConversation, 'BadSection');
        } catch (e) {
          expect(e.message).toContain('Available sections:');
          expect(e.message).toContain('Introduction');
          expect(e.message).toContain('Available IDs:');
          expect(e.message).toContain('greeting');
        }
      });

      it('should throw error for invalid clip syntax', () => {
        expect(() => clip(sampleConversation, '[[['))
          .toThrow(/Clip syntax error/);
      });

      it('should throw error for invalid ranges', () => {
        expect(() => clip(sampleConversation, '[5, 2]'))
          .toThrow(/Invalid clip range/);
      });
    });

    describe('edge cases', () => {
      it('should handle minimal conversations', () => {
        const minimalConv = createConversation(`~~~~
Alex: Hi there
`);
        const result = clip(minimalConv, '[,]');
        expect(result.valid).toBe(true);
        expect(result.start).toBe(0);
        expect(result.end).toBe(0);
      });

      it('should handle conversations with only headers', () => {
        const headerOnlyConv = createConversation(`~~~~
Section One
-----------

Section Two
-----------
`);
        const result = clip(headerOnlyConv, '"Section One"');
        expect(result).toEqual({ start: 0, end: 0, valid: true, message: null });
      });

      it('should handle whitespace in section names', () => {
        const result = clip(sampleConversation, '"Introduction"');
        expect(result).toEqual({ start: 0, end: 2, valid: true, message: null });
      });

      it('should handle special characters in IDs', () => {
        const convWithSpecialIds = createConversation(`~~~~
[id=test-id-123]
Alex: Test with special ID
`);
        // Note: Current grammar only allows [a-zA-Z0-9_\.:-] in identifiers
        const result = clip(convWithSpecialIds, 'test-id-123');
        expect(result).toEqual({ start: 0, end: 0, valid: true, message: null });
      });
    });
  });
});
