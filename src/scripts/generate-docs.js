#!/usr/bin/env node
// src/scripts/generate-docs.js
import fs from 'fs';
import path from 'path';
import stringify from 'json-stable-stringify';

const args = process.argv.slice(2);
const blocksDir = path.resolve('./src/components/blocks');

/**
 * Extract block metadata from component definition file
 */
function extractBlockMetadata(componentPath) {
  try {
    const content = fs.readFileSync(componentPath, 'utf8');

    // Extract component name from core() call
    const nameMatch = content.match(/name:\s*['"`]([^'"`]+)['"`]/);
    const name = nameMatch ? nameMatch[1] : path.basename(path.dirname(componentPath));

    // Look for description or short description
    const descMatch = content.match(/(?:description|shortDescription):\s*['"`]([^'"`]+)['"`]/);
    const description = descMatch ? descMatch[1] : '';

    return {
      name,
      description,
      componentPath: componentPath.replace(process.cwd() + '/', '')
    };
  } catch (err) {
    console.warn(`⚠️  Could not extract metadata from ${componentPath}:`, err.message);
    return {
      name: path.basename(path.dirname(componentPath)),
      description: '',
      componentPath: componentPath.replace(process.cwd() + '/', '')
    };
  }
}

/**
 * Scan block directory for documentation files
 */
function scanBlockDirectory(blockPath) {
  const blockName = path.basename(blockPath);
  const files = fs.readdirSync(blockPath);

  const docs = {
    name: blockName,
    path: blockPath.replace(process.cwd() + '/', ''),
    component: null,
    documentation: null,
    examples: [],
    metadata: {}
  };

  for (const file of files) {
    const filePath = path.join(blockPath, file);
    const fileStats = fs.statSync(filePath);

    if (fileStats.isFile()) {
      const relativePath = filePath.replace(process.cwd() + '/', '');

      if ((file.endsWith('.js') || file.endsWith('.jsx')) &&
          (file === `${blockName}.js` || file === `${blockName}.jsx` || file === 'index.js' || file === 'index.jsx')) {
        docs.component = relativePath;
        docs.metadata = extractBlockMetadata(filePath);
      } else if (file.endsWith('.md')) {
        docs.documentation = relativePath;
      } else if (file.endsWith('.olx') || file.endsWith('.xml')) {
        docs.examples.push(relativePath);
      }
    }
  }

  return docs;
}

/**
 * Generate comprehensive documentation index
 */
async function generateDocumentation() {
  try {
    const blocks = [];
    const blockDirs = fs.readdirSync(blocksDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`📖 Scanning ${blockDirs.length} block directories...`);

    for (const blockDir of blockDirs) {
      const blockPath = path.join(blocksDir, blockDir);
      const blockDocs = scanBlockDirectory(blockPath);

      // Only include blocks that have actual documentation or examples
      if (blockDocs.documentation || blockDocs.examples.length > 0 || blockDocs.component) {
        blocks.push(blockDocs);
        console.log(`✅ Found documentation for ${blockDir}`);
      } else {
        console.log(`⚠️  No documentation found for ${blockDir}`);
      }
    }

    const documentation = {
      generated: new Date().toISOString(),
      totalBlocks: blocks.length,
      blocks: blocks.sort((a, b) => a.name.localeCompare(b.name))
    };

    return documentation;
  } catch (err) {
    throw new Error(`Failed to generate documentation: ${err.message}`);
  }
}

async function main() {
  try {
    console.log('🔍 Generating block documentation...');
    const docs = await generateDocumentation();

    const output = stringify(docs, { space: 2 });

    if (args.includes('--out')) {
      const outIndex = args.indexOf('--out');
      const outFile = args[outIndex + 1];
      fs.writeFileSync(outFile, output);
      console.log(`✅ Documentation written to ${outFile}`);
      console.log(`📊 Generated docs for ${docs.totalBlocks} blocks`);
    } else {
      console.log(output);
    }

    // Also generate a summary for quick reference
    console.log('\n📋 Documentation Summary:');
    docs.blocks.forEach(block => {
      const status = [];
      if (block.component) status.push('✓ Component');
      if (block.documentation) status.push('✓ Docs');
      if (block.examples.length > 0) status.push(`✓ Examples (${block.examples.length})`);

      console.log(`  ${block.name}: ${status.join(', ') || '❌ No docs found'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error generating documentation:', err.message);
    process.exit(1);
  }
}

main();