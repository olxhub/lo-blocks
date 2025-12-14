// src/app/api/docs/grammars/route.js
//
// Grammar list API - serves metadata for all registered PEG grammars.
// Parallel to /api/docs for blocks.
// See ../DESIGN.md for architectural decisions.
//
import { promises as fs } from 'fs';
import path from 'path';
import { grammarInfo, PEG_CONTENT_EXTENSIONS } from '@/generated/parserRegistry';
import { resolveSafeReadPath } from '@/lib/storage/providers/file';

/**
 * Extract metadata from YAML frontmatter in a .pegjs file.
 * Format parallel to OLX:
 *
 * /×---
 * description: This describes a conversation...
 * category: specialized
 * ---×/
 *
 * (× used above to avoid breaking this comment)
 */
function extractMetadata(content) {
  // Look for YAML frontmatter in block comment: /*--- ... ---*/
  const frontmatterMatch = content.match(/^\/\*---\s*\n([\s\S]*?)\n---\*\//);
  if (!frontmatterMatch) {
    return {};
  }

  const yamlContent = frontmatterMatch[1];
  const metadata = {};

  // Simple YAML parsing for key: value pairs
  for (const line of yamlContent.split('\n')) {
    const match = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/);
    if (match) {
      metadata[match[1]] = match[2];
    }
  }

  return metadata;
}

/**
 * Generate grammar documentation from parserRegistry.
 */
async function generateGrammarDocs() {
  const grammars = [];
  const projectRoot = process.cwd();

  for (const ext of PEG_CONTENT_EXTENSIONS) {
    const info = grammarInfo[ext];
    if (!info) continue;

    const grammarDirPath = info.grammarDir.replace(/^@\//, 'src/');
    const grammarFileName = `${info.grammarName}.pegjs`;
    const grammarFilePath = `${grammarDirPath}/${grammarFileName}`;

    const grammar = {
      name: info.grammarName,
      extension: ext,
      fileExtension: `.${ext}`,
      source: grammarFilePath,
      grammarDir: grammarDirPath,
      description: null,
      readme: null,
      hasPreview: false,
      exampleCount: 0
    };

    // Read grammar file to extract metadata
    try {
      const fullPath = await resolveSafeReadPath(projectRoot, grammarFilePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const metadata = extractMetadata(content);
      grammar.description = metadata.description || null;
    } catch (err) {
      // Grammar file might not exist (stale registry entry)
      if (err.code !== 'ENOENT') {
        console.warn(`[API /docs/grammars] Could not read ${grammarFilePath}: ${err.message}`);
      }
      continue; // Skip grammars without source files
    }

    // Check for README
    const readmePath = `${grammarDirPath}/${info.grammarName}.pegjs.md`;
    try {
      await resolveSafeReadPath(projectRoot, readmePath);
      grammar.readme = readmePath;
    } catch {
      // Also try README.md in the grammar directory
      try {
        const altReadmePath = `${grammarDirPath}/README.md`;
        await resolveSafeReadPath(projectRoot, altReadmePath);
        grammar.readme = altReadmePath;
      } catch {
        // No readme - that's fine
      }
    }

    // Check for preview template
    const previewPath = `${grammarDirPath}/${info.grammarName}.pegjs.preview.olx`;
    try {
      await resolveSafeReadPath(projectRoot, previewPath);
      grammar.hasPreview = true;
    } catch {
      // No preview - that's fine
    }

    // Count example files (files with the grammar's extension in the directory)
    try {
      const dirFullPath = await resolveSafeReadPath(projectRoot, grammarDirPath);
      const files = await fs.readdir(dirFullPath);
      grammar.exampleCount = files.filter(f => f.endsWith(`.${ext}`)).length;
    } catch {
      // Can't read directory - that's fine
    }

    grammars.push(grammar);
  }

  return {
    generated: new Date().toISOString(),
    totalGrammars: grammars.length,
    grammars: grammars.sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function GET(request) {
  try {
    const docs = await generateGrammarDocs();

    return Response.json({
      ok: true,
      documentation: docs
    });
  } catch (error) {
    console.error('Error generating grammar documentation:', error);

    return Response.json(
      {
        ok: false,
        error: error.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
