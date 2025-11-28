// src/app/api/docs/[block]/route.js
//
// Individual block documentation API - serves detailed docs for a specific block.
// Reads readme and example file contents from paths stored on the block object.
//
import fs from 'fs/promises';
import path from 'path';
import { COMPONENT_MAP } from '@/components/componentMap';
import { resolveSafePath } from '@/lib/storage/providers/file';

export async function GET(request, { params }) {
  const { block: blockName } = await params;

  try {
    // Find block by export name (key in COMPONENT_MAP) or OLXName
    let block = COMPONENT_MAP[blockName];
    if (!block || !block._isBlock) {
      block = Object.values(COMPONENT_MAP).find(
        b => b._isBlock && b.OLXName === blockName
      );
    }

    if (!block || !block._isBlock) {
      return Response.json(
        { ok: false, error: `Block '${blockName}' not found` },
        { status: 404 }
      );
    }

    const blockDocs = {
      name: block.OLXName,
      description: block.description || null,
      namespace: block.namespace,
      source: block.source || null,
      fields: Object.keys(block.fields || {}),
      hasAction: !!block.action,
      hasParser: !!block.parser,
      readme: null,
      examples: []
    };

    // Read readme content if path exists
    if (block.readme) {
      try {
        const readmePath = await resolveSafePath(process.cwd(), block.readme);
        blockDocs.readme = {
          path: block.readme,
          content: await fs.readFile(readmePath, 'utf8')
        };
      } catch (err) {
        console.warn(`Could not read readme for ${blockName}: ${err.message}`);
      }
    }

    // Read example file contents
    if (block.examples && block.examples.length > 0) {
      for (const example of block.examples) {
        // Handle both old format (string) and new format ({path, gitStatus})
        const examplePath = typeof example === 'string' ? example : example.path;
        const gitStatus = typeof example === 'object' ? example.gitStatus : null;
        try {
          const fullPath = await resolveSafePath(process.cwd(), examplePath);
          blockDocs.examples.push({
            path: examplePath,
            filename: path.basename(examplePath),
            content: await fs.readFile(fullPath, 'utf8'),
            gitStatus
          });
        } catch (err) {
          console.warn(`Could not read example ${examplePath}: ${err.message}`);
        }
      }
    }

    return Response.json({
      ok: true,
      block: blockDocs
    });
  } catch (error) {
    console.error(`Error loading documentation for block '${blockName}':`, error);

    return Response.json(
      {
        ok: false,
        error: error.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}