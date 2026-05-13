// src/app/api/docs/[block]/route.js
//
// Individual block documentation API - serves detailed docs for a specific block.
// Reads readme and example file contents from paths stored on the block object.
//
import fs from 'fs/promises';
import path from 'path';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { resolveSafeReadPath } from '@/lib/lofs/providers/file';

export async function GET(request, { params }) {
  const { block: blockName } = await params;

  try {
    // Find block by export name (key in BLOCK_REGISTRY) or block name
    let block = BLOCK_REGISTRY[blockName];
    if (!block || !block._isBlock) {
      block = Object.values(BLOCK_REGISTRY).find(
        b => b._isBlock && b.name === blockName
      );
    }

    if (!block || !block._isBlock) {
      return Response.json(
        { ok: false, error: `Block '${blockName}' not found` },
        { status: 404 }
      );
    }

    const blockDocs = {
      name: block.name,
      description: block.description || null,
      namespace: block.namespace,
      source: block.source || null,
      fields: Object.keys(block.fields || {}),
      hasAction: !!block.action,
      hasParser: !!block.parser,
      template: null,
      demo: null,
      readme: null,
      examples: []
    };

    // Read template (editor insert) and demo (docs marquee) content
    if (block.template) {
      try {
        const fullPath = await resolveSafeReadPath(process.cwd(), block.template);
        blockDocs.template = await fs.readFile(fullPath, 'utf8');
      } catch (err) {
        console.warn(`Could not read template for ${blockName}: ${err.message}`);
      }
    }
    if (block.demo) {
      try {
        const fullPath = await resolveSafeReadPath(process.cwd(), block.demo);
        blockDocs.demo = await fs.readFile(fullPath, 'utf8');
      } catch (err) {
        console.warn(`Could not read demo for ${blockName}: ${err.message}`);
      }
    }

    // Read readme content if path exists
    if (block.readme) {
      try {
        const readmePath = await resolveSafeReadPath(process.cwd(), block.readme);
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
        try {
          const fullPath = await resolveSafeReadPath(process.cwd(), example.path);
          blockDocs.examples.push({
            path: example.path,
            filename: path.basename(example.path),
            content: await fs.readFile(fullPath, 'utf8'),
            gitStatus: example.gitStatus ?? null
          });
        } catch (err) {
          console.warn(`Could not read example ${example.path}: ${err.message}`);
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