// src/integration/demo-render.test.js
//
// Tests that all demo .olx files in the blocks directory render without errors.
// This catches:
// - React render errors (missing props, invalid JSX, etc.)
// - Component registration issues
// - Parser/loader bugs that only manifest at render time
//
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { parseOLX } from '@/lib/content/parseOLX';
import { render, makeRootNode } from '@/lib/render';
import { COMPONENT_MAP } from '@/components/componentMap';
import { Provider } from 'react-redux';
import React from 'react';
import { store } from '@/lib/state/store';
import { render as rtlRender, cleanup } from '@testing-library/react';
import fs from 'fs/promises';
import path from 'path';
import { injectPreviewContent } from '@/lib/template/previewTemplate';

// Mock scrollTo for jsdom (Chat components use this)
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function() {};
}

// Recursively find all .olx files in a directory
async function findOlxFiles(dir) {
  const files = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return; // Skip directories we can't read
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.olx')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

describe('Demo OLX files render without errors', () => {
  let demoFiles = [];

  beforeAll(async () => {
    // Find all .olx files in the blocks directory
    const blocksDir = path.resolve('./src/components/blocks');
    demoFiles = await findOlxFiles(blocksDir);
  });

  it('found demo files to test', () => {
    expect(demoFiles.length).toBeGreaterThan(0);
    console.log(`Found ${demoFiles.length} demo .olx files to test`);
  });

  it('all demo files parse and render without throwing', async () => {
    const errors = [];

    // Files that intentionally render DisplayError for testing purposes
    const intentionalErrorFiles = [
      'ErrorNode.olx', // Tests the error display component itself
    ];

    for (const filePath of demoFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const fileName = path.basename(filePath);

      // Skip files that are meant to demonstrate errors
      const isIntentionalError = intentionalErrorFiles.some(f => fileName === f);

      try {
        // Read the file
        let content = await fs.readFile(filePath, 'utf-8');

        // For .pegjs.preview.olx files, inject sample content from companion file
        if (filePath.endsWith('.pegjs.preview.olx')) {
          // Find companion sample file (e.g., sort.pegjs.preview.sortpeg)
          const dir = path.dirname(filePath);
          const baseName = path.basename(filePath, '.olx'); // e.g., "sort.pegjs.preview"
          const files = await fs.readdir(dir);
          const sampleFile = files.find(f => f.startsWith(baseName) && !f.endsWith('.olx'));

          if (sampleFile) {
            const sampleContent = await fs.readFile(path.join(dir, sampleFile), 'utf-8');
            const result = injectPreviewContent(content, sampleContent);
            if ('error' in result) {
              errors.push({ file: relativePath, error: result.error });
              continue;
            }
            content = result.olx;
          } else {
            errors.push({
              file: relativePath,
              error: `No sample content file found for preview (expected ${baseName}.*)`
            });
            continue;
          }
        }

        // Parse the OLX
        const { idMap, root } = await parseOLX(content, [`file://${filePath}`]);

        if (!root || !idMap[root]) {
          errors.push({
            file: relativePath,
            error: 'No root element found after parsing'
          });
          continue;
        }

        // Create Redux store
        const reduxStore = store.init();

        // Render the component
        const element = render({
          node: { type: 'block', id: root },
          idMap,
          nodeInfo: makeRootNode(),
          componentMap: COMPONENT_MAP
        });

        // Use React Testing Library to actually mount the component
        // This will catch React errors that only occur during render
        const { unmount, container } = rtlRender(
          React.createElement(Provider, { store: reduxStore }, element)
        );

        // Check for DisplayError components in the rendered output (skip intentional error files)
        if (!isIntentionalError) {
          const displayErrors = container.querySelectorAll('.lo-display-error');
          if (displayErrors.length > 0) {
            const errorMessages = Array.from(displayErrors).map(el => {
              const strong = el.querySelector('strong')?.textContent || 'Unknown';
              const text = el.textContent.split(':')[1]?.trim().split('\n')[0] || '';
              return `${strong}: ${text}`;
            });
            errors.push({
              file: relativePath,
              error: `DisplayError rendered: ${errorMessages.join('; ')}`
            });
          }
        }

        // Clean up
        unmount();
        cleanup();

      } catch (err) {
        // Include full stack trace for debugging
        const errorWithStack = err.stack || err.message || String(err);
        errors.push({
          file: relativePath,
          error: errorWithStack
        });
      }
    }

    // Report all errors at once for better debugging
    if (errors.length > 0) {
      const errorReport = errors.map(e => `  ${e.file}:\n    ${e.error}`).join('\n\n');
      throw new Error(`${errors.length} demo file(s) failed to render:\n\n${errorReport}`);
    }
  }, 60000); // Allow 60 seconds for all files
});
