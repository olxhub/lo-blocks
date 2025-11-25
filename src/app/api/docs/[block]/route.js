// src/app/api/docs/[block]/route.js
import fs from 'fs';
import path from 'path';

const blocksDir = path.resolve('./src/components/blocks');

export async function GET(request, { params }) {
  const { block } = await params;
  
  try {
    const blockPath = path.join(blocksDir, block);
    
    // Check if block directory exists
    if (!fs.existsSync(blockPath) || !fs.statSync(blockPath).isDirectory()) {
      return Response.json(
        {
          ok: false,
          error: `Block '${block}' not found`,
        },
        { status: 404 }
      );
    }
    
    const files = fs.readdirSync(blockPath);
    const blockDocs = {
      name: block,
      documentation: null,
      examples: [],
      component: null
    };
    
    // Read documentation file if it exists
    const mdFile = files.find(f => f.endsWith('.md'));
    if (mdFile) {
      const mdPath = path.join(blockPath, mdFile);
      blockDocs.documentation = {
        filename: mdFile,
        content: fs.readFileSync(mdPath, 'utf8')
      };
    }
    
    // Read example files
    const exampleFiles = files.filter(f => f.endsWith('.olx') || f.endsWith('.xml'));
    for (const exampleFile of exampleFiles) {
      const examplePath = path.join(blockPath, exampleFile);
      blockDocs.examples.push({
        filename: exampleFile,
        content: fs.readFileSync(examplePath, 'utf8')
      });
    }
    
    // Get component info
    const componentFile = files.find(f => 
      (f.endsWith('.js') || f.endsWith('.jsx')) && 
      (f === `${block}.js` || f === `${block}.jsx` || f === 'index.js' || f === 'index.jsx')
    );
    if (componentFile) {
      blockDocs.component = {
        filename: componentFile,
        path: `src/components/blocks/${block}/${componentFile}`
      };
    }
    
    return Response.json({
      ok: true,
      block: blockDocs
    });
  } catch (error) {
    console.error(`Error loading documentation for block '${block}':`, error);
    
    return Response.json(
      {
        ok: false,
        error: error.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}