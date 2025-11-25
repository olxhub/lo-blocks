// src/app/api/docs/route.js
import fs from 'fs';
import path from 'path';

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
    
    for (const blockDir of blockDirs) {
      const blockPath = path.join(blocksDir, blockDir);
      const blockDocs = scanBlockDirectory(blockPath);
      
      // Only include blocks that have actual documentation or examples
      if (blockDocs.documentation || blockDocs.examples.length > 0 || blockDocs.component) {
        blocks.push(blockDocs);
      }
    }
    
    return {
      generated: new Date().toISOString(),
      totalBlocks: blocks.length,
      blocks: blocks.sort((a, b) => a.name.localeCompare(b.name))
    };
  } catch (err) {
    throw new Error(`Failed to generate documentation: ${err.message}`);
  }
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