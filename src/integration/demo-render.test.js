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

    for (const filePath of demoFiles) {
      const relativePath = path.relative(process.cwd(), filePath);

      try {
        // Read the file
        const content = await fs.readFile(filePath, 'utf-8');

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
          node: root,
          idMap,
          nodeInfo: makeRootNode(),
          componentMap: COMPONENT_MAP
        });

        // Use React Testing Library to actually mount the component
        // This will catch React errors that only occur during render
        const { unmount } = rtlRender(
          React.createElement(Provider, { store: reduxStore }, element)
        );

        // Clean up
        unmount();
        cleanup();

      } catch (err) {
        errors.push({
          file: relativePath,
          error: err.message || String(err)
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
