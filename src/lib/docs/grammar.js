// src/lib/docs/grammar.js
//
// Grammar documentation: metadata, examples, READMEs.
// Used by API routes and directly by tools/LLMs.
//
// TODO: Consider extracting shared helpers between getGrammarMetadata and
// getAllGrammarsMetadata (path construction, README discovery, file loading).
//
// the duplication is ~80 lines (but the file is still readable).
//
import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { grammarInfo, PEG_CONTENT_EXTENSIONS } from '@/generated/parserRegistry';
import { resolveSafeReadPath } from '@/lib/lofs/providers/file';

// Regex to find YAML frontmatter in a block comment: /*--- ... ---*/
const FRONTMATTER_REGEX = /^\/\*---\s*\n([\s\S]*?)\n---\*\//;

/**
 * Extract metadata from YAML frontmatter in a .pegjs file content string.
 * Format parallel to OLX metadata in HTML comments.
 */
export function extractMetadata(content) {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  if (!frontmatterMatch) {
    return {};
  }

  try {
    const parsed = yaml.load(frontmatterMatch[1]);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (err) {
    console.warn('[extractMetadata] Failed to parse YAML frontmatter:', err.message);
    return {};
  }
}

/**
 * Get metadata for a single grammar by name or extension.
 * @param {string} name - Grammar name (e.g., "chat") or extension (e.g., "chatpeg")
 * @returns {Promise<{ok: true, grammar: object} | {ok: false, error: string}>}
 */
export async function getGrammarMetadata(name) {
  const projectRoot = process.cwd();

  // Accept both "chat" and "chatpeg"
  const ext = name.endsWith('peg') ? name : `${name}peg`;
  const info = grammarInfo[ext];

  if (!info) {
    return { ok: false, error: `Grammar '${name}' not found` };
  }

  const grammarDirPath = info.grammarDir.replace(/^@\//, 'src/');
  const grammarFileName = `${info.grammarName}.pegjs`;
  const grammarFilePath = `${grammarDirPath}/${grammarFileName}`;

  const result = {
    name: info.grammarName,
    extension: ext,
    fileExtension: `.${ext}`,
    source: grammarFilePath,
    grammarDir: grammarDirPath,
    description: null,
    grammar: null,
    preview: null,
    readme: null,
    examples: []
  };

  // Read grammar file
  try {
    const fullPath = await resolveSafeReadPath(projectRoot, grammarFilePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    result.grammar = content;
    const metadata = extractMetadata(content);
    result.description = metadata.description || null;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[getGrammarMetadata] Could not read ${grammarFilePath}: ${err.message}`);
    }
  }

  // Load preview template if it exists
  const previewPath = `${grammarDirPath}/${info.grammarName}.pegjs.preview.olx`;
  try {
    const fullPath = await resolveSafeReadPath(projectRoot, previewPath);
    result.preview = await fs.readFile(fullPath, 'utf-8');
  } catch (err) {
    if (err.code !== 'ENOENT' && !err.message?.includes('not found')) {
      console.warn(`[getGrammarMetadata] Could not read preview: ${err.message}`);
    }
  }

  // Load README if it exists
  const readmePaths = [
    `${grammarDirPath}/${info.grammarName}.pegjs.md`,
    `${grammarDirPath}/README.md`
  ];
  for (const readmePath of readmePaths) {
    try {
      const fullPath = await resolveSafeReadPath(projectRoot, readmePath);
      result.readme = {
        path: readmePath,
        content: await fs.readFile(fullPath, 'utf-8')
      };
      break;
    } catch {
      // Try next path
    }
  }

  // Load example files
  try {
    const dirFullPath = await resolveSafeReadPath(projectRoot, grammarDirPath);
    const files = await fs.readdir(dirFullPath);
    const exampleFiles = files.filter(f => f.endsWith(`.${ext}`));

    for (const filename of exampleFiles) {
      const examplePath = `${grammarDirPath}/${filename}`;
      try {
        const fullPath = await resolveSafeReadPath(projectRoot, examplePath);
        result.examples.push({
          path: examplePath,
          filename,
          content: await fs.readFile(fullPath, 'utf-8')
        });
      } catch (err) {
        console.warn(`[getGrammarMetadata] Could not read example ${examplePath}: ${err.message}`);
      }
    }
  } catch {
    // Can't read directory - that's fine
  }

  return { ok: true, grammar: result };
}

/**
 * Get metadata for all registered grammars.
 * @returns {Promise<{ok: true, documentation: object} | {ok: false, error: string}>}
 */
export async function getAllGrammarsMetadata() {
  const projectRoot = process.cwd();
  const grammars = [];

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
      if (err.code !== 'ENOENT') {
        console.warn(`[getAllGrammarsMetadata] Could not read ${grammarFilePath}: ${err.message}`);
      }
      continue; // Skip grammars without source files
    }

    // Check for README
    const readmePaths = [
      `${grammarDirPath}/${info.grammarName}.pegjs.md`,
      `${grammarDirPath}/README.md`
    ];
    for (const readmePath of readmePaths) {
      try {
        await resolveSafeReadPath(projectRoot, readmePath);
        grammar.readme = readmePath;
        break;
      } catch {
        // Try next path
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

    // Count example files
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
    ok: true,
    documentation: {
      generated: new Date().toISOString(),
      totalGrammars: grammars.length,
      grammars: grammars.sort((a, b) => a.name.localeCompare(b.name))
    }
  };
}
