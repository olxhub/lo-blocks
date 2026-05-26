// src/app/api/docs/[block]/route.js
//
// Individual block documentation API - serves detailed docs for a specific block.
// Reads readme and example file contents from paths stored on the block object.
//
import fs from 'fs/promises';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { resolveSafeReadPath } from '@/lib/lofs/providers/file';

async function safeRead(relPath) {
  try {
    const full = await resolveSafeReadPath(process.cwd(), relPath);
    return await fs.readFile(full, 'utf8');
  } catch {
    return null;
  }
}

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
      template: block.template ?? null,   // Key into examples
      demo: block.demo ?? null,           // Key into examples
      readme: null,
      examples: {},
    };

    // Read readme content if path exists
    if (block.readme) {
      const content = await safeRead(block.readme);
      if (content) {
        blockDocs.readme = { path: block.readme, content };
      }
    }

    // Read example file contents (dict keyed by filename)
    if (block.examples) {
      const entries = await Promise.all(
        Object.entries(block.examples).map(async ([filename, example]) => {
          const content = await safeRead(example.path);
          if (content === null) return null;
          return [filename, {
            path: example.path,
            content,
            gitStatus: example.gitStatus ?? null,
          }];
        }),
      );
      blockDocs.examples = Object.fromEntries(entries.filter(Boolean));
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
