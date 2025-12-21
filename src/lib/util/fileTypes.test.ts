// src/lib/util/fileTypes.test.ts
//
// End-to-end tests for file type detection.
// Not exhaustive unit tests - just verify the system works correctly.
//

import {
  getExtension,
  getContentType,
  isOLXFile,
  isPEGFile,
  isContentFile,
  isMediaFile,
  acceptString,
  EXT,
  CATEGORY,
} from './fileTypes';

describe('fileTypes', () => {
  test('extension extraction normalizes to lowercase', () => {
    expect(getExtension('foo/bar.OLX')).toBe('olx');
    expect(getExtension('TEST.ChatPeg')).toBe('chatpeg');
    expect(getExtension('no-extension')).toBe('');
    expect(getExtension(null)).toBe('');
    expect(getExtension(undefined)).toBe('');
    // Dots in directory names should be ignored
    expect(getExtension('/home/bob/my.files/file.ext')).toBe('ext');
    expect(getExtension('/home/bob/my.files/noext')).toBe('');
  });

  test('file type helpers correctly identify files', () => {
    // OLX files
    expect(isOLXFile('content/demo.olx')).toBe(true);
    expect(isOLXFile('content/demo.xml')).toBe(true);
    expect(isOLXFile('content/demo.OLX')).toBe(true); // case insensitive
    expect(isOLXFile('content/demo.md')).toBe(false);

    // PEG files
    expect(isPEGFile('dialogue.chatpeg')).toBe(true);
    expect(isPEGFile('items.sortpeg')).toBe(true);
    expect(isPEGFile('demo.olx')).toBe(false);

    // Content files (OLX + MD + PEG)
    expect(isContentFile('demo.olx')).toBe(true);
    expect(isContentFile('readme.md')).toBe(true);
    expect(isContentFile('chat.chatpeg')).toBe(true);
    expect(isContentFile('script.js')).toBe(false);

    // Media files
    expect(isMediaFile('photo.jpg')).toBe(true);
    expect(isMediaFile('photo.PNG')).toBe(true); // case insensitive
    expect(isMediaFile('doc.pdf')).toBe(true);
    expect(isMediaFile('demo.olx')).toBe(false);
  });

  test('getContentType returns correct type for dispatch', () => {
    expect(getContentType('demo.olx')).toBe('olx');
    expect(getContentType('demo.xml')).toBe('olx');
    expect(getContentType('readme.md')).toBe('markdown');
    expect(getContentType('chat.chatpeg')).toBe('peg');
    expect(getContentType('app.js')).toBe('code');
    expect(getContentType('notes.txt')).toBe('text');
    expect(getContentType('photo.jpg')).toBe('image');
    expect(getContentType('movie.mp4')).toBe('video');
    expect(getContentType('doc.pdf')).toBe('document');
    expect(getContentType('unknown.xyz')).toBe('unknown');
  });

  test('categories are composable and complete', () => {
    // Content includes all authored file types
    expect(CATEGORY.content).toContain('olx');
    expect(CATEGORY.content).toContain('xml');
    expect(CATEGORY.content).toContain('md');
    expect(CATEGORY.content).toContain('chatpeg');

    // Uploadable includes content + code + text
    expect(CATEGORY.uploadable).toContain('olx');
    expect(CATEGORY.uploadable).toContain('js');
    expect(CATEGORY.uploadable).toContain('txt');

    // PEG extensions are dynamically included
    expect(EXT.peg.length).toBeGreaterThan(0);
    expect(EXT.peg).toContain('chatpeg');
  });

  test('acceptString generates valid HTML accept attribute', () => {
    const accept = acceptString('uploadable');
    expect(accept).toContain('.olx');
    expect(accept).toContain('.md');
    expect(accept).toContain('.js');
    expect(accept).toMatch(/^\.[a-z]+/); // starts with .ext
  });
});
