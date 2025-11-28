// src/app/api/docs/route.js
//
// Block documentation API - serves metadata for all registered blocks.
// Uses COMPONENT_MAP which includes runtime metadata (description, fields, etc.)
// plus source/readme/examples paths added by the registry generator.
//
import { COMPONENT_MAP } from '@/components/componentMap';

/**
 * Generate documentation index from COMPONENT_MAP.
 */
function generateDocumentation() {
  const blocks = [];

  for (const [exportName, block] of Object.entries(COMPONENT_MAP)) {
    if (!block._isBlock) continue;

    blocks.push({
      name: block.OLXName || exportName,
      exportName,
      description: block.description || null,
      namespace: block.namespace,
      source: block.source || null,
      category: block.category || null,
      readme: block.readme || null,
      examples: block.examples || [],
      fields: Object.keys(block.fields || {}),
      hasAction: !!block.action,
      hasParser: !!block.parser,
      internal: block.internal || false,
      gitStatus: block.gitStatus || null,
      readmeGitStatus: block.readmeGitStatus || null
    });
  }

  return {
    generated: new Date().toISOString(),
    totalBlocks: blocks.length,
    blocks: blocks.sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function GET(request) {
  try {
    const docs = await generateDocumentation();
    
    return Response.json({
      ok: true,
      documentation: docs
    });
  } catch (error) {
    console.error('Error generating documentation:', error);
    
    return Response.json(
      {
        ok: false,
        error: error.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}