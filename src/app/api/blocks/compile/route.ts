// src/app/api/blocks/compile/route.ts
//
// Dynamic block compilation endpoint.
// Compiles TypeScript/TSX block source into ESM bundles for runtime loading.
//
// Strategy: Transform source to reference globalThis.__LO_BLOCKS_RUNTIME__
// before bundling, then bundle with esbuild.
//
import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

// Directory for compiled dynamic blocks
const DYNAMIC_BLOCKS_DIR = path.join(process.cwd(), 'public', 'dynamic-blocks');

// Header that gets prepended to define the runtime shorthand
const RUNTIME_HEADER = `
// Dynamic block runtime
const __R = globalThis.__LO_BLOCKS_RUNTIME__;
if (!__R) throw new Error('Block runtime not initialized. Call initBlockRuntime() first.');
`;

// Transform source to use runtime globals instead of imports
function transformSource(source: string): string {
  // Replace @/lib/* imports with runtime references
  let result = source;

  // import { core, test } from '@/lib/blocks' → const { core, test } = __R
  result = result.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/blocks['"]/g,
    'const {$1} = __R'
  );

  // import * as parsers from '@/lib/content/parsers' → const parsers = __R.parsers
  result = result.replace(
    /import\s*\*\s*as\s*(\w+)\s*from\s*['"]@\/lib\/content\/parsers['"]/g,
    'const $1 = __R.parsers'
  );

  // import * as state from '@/lib/state' → const state = __R.state
  result = result.replace(
    /import\s*\*\s*as\s*(\w+)\s*from\s*['"]@\/lib\/state['"]/g,
    'const $1 = __R.state'
  );

  // import { fields, fieldSelector, ... } from '@/lib/state' → const { fields, ... } = __R
  result = result.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/state['"]/g,
    'const {$1} = __R'
  );

  // import { baseAttributes, ... } from '@/lib/blocks/attributeSchemas' → const { ... } = __R
  result = result.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/blocks\/attributeSchemas['"]/g,
    'const {$1} = __R'
  );

  // import { useReduxState } from '@/lib/state' → already handled above

  // Generic fallback for any remaining @/lib/* imports
  result = result.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/[^'"]+['"]/g,
    'const {$1} = __R'
  );

  // Remove 'use client' directive (not needed for dynamic blocks)
  result = result.replace(/['"]use client['"];?\s*/g, '');

  return result;
}

export async function POST(req: Request) {
  try {
    const { name, sources: rawSources } = await req.json();

    // Validate input
    if (!name || typeof name !== 'string') {
      return Response.json({ ok: false, error: 'Missing or invalid block name' }, { status: 400 });
    }
    if (!rawSources || typeof rawSources !== 'object') {
      return Response.json({ ok: false, error: 'Missing or invalid sources object' }, { status: 400 });
    }

    // Transform all source files
    const sources: Record<string, string> = {};
    for (const [filename, content] of Object.entries(rawSources)) {
      sources[filename] = transformSource(content as string);
    }

    // Find entry point
    const entryPoint = sources[`${name}.ts`] ? `${name}.ts`
      : sources[`${name}.tsx`] ? `${name}.tsx`
      : Object.keys(sources).find(k => k.endsWith('.ts') || k.endsWith('.tsx'));

    if (!entryPoint || !sources[entryPoint]) {
      return Response.json({ ok: false, error: `No entry point found for block ${name}` }, { status: 400 });
    }

    // Build with esbuild
    const result = await esbuild.build({
      stdin: {
        contents: sources[entryPoint],
        loader: entryPoint.endsWith('.tsx') ? 'tsx' : 'ts',
        resolveDir: '/virtual',
        sourcefile: entryPoint,
      },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      // React comes from the runtime
      external: ['react', 'react-dom'],
      jsx: 'transform',
      jsxFactory: '__R.React.createElement',
      jsxFragment: '__R.React.Fragment',
      plugins: [
        {
          name: 'virtual-fs',
          setup(build) {
            // Resolve local imports (./foo, ./bar.tsx)
            build.onResolve({ filter: /^\./ }, args => {
              const resolved = args.path.replace(/^\.\//, '');
              return { path: resolved, namespace: 'virtual' };
            });

            // Load from virtual sources
            build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
              const content = sources[args.path]
                || sources[`${args.path}.ts`]
                || sources[`${args.path}.tsx`]
                || sources[`${args.path}.js`]
                || sources[`${args.path}.jsx`];

              if (!content) {
                return { errors: [{ text: `Virtual file not found: ${args.path}` }] };
              }

              const loader = args.path.endsWith('.tsx') || args.path.endsWith('.jsx') ? 'tsx'
                : args.path.endsWith('.ts') ? 'ts'
                : 'jsx';

              return { contents: content, loader };
            });
          },
        },
      ],
      write: false,
      minify: false,
      sourcemap: 'inline',
    });

    if (result.errors.length > 0) {
      return Response.json({
        ok: false,
        error: 'Compilation failed',
        details: result.errors,
      }, { status: 400 });
    }

    // Prepend runtime header
    const compiledCode = result.outputFiles[0].text;
    const code = RUNTIME_HEADER + '\n' + compiledCode;

    // Ensure output directory exists
    await fs.mkdir(DYNAMIC_BLOCKS_DIR, { recursive: true });

    // Write compiled bundle
    const version = Date.now();
    const filename = `${name}-${version}.js`;
    const filepath = path.join(DYNAMIC_BLOCKS_DIR, filename);
    await fs.writeFile(filepath, code, 'utf-8');

    const url = `/dynamic-blocks/${filename}`;

    return Response.json({
      ok: true,
      url,
      version,
      name,
      size: code.length,
    });

  } catch (error: any) {
    console.error('Block compilation error:', error);
    return Response.json({
      ok: false,
      error: error.message || 'Unknown compilation error',
    }, { status: 500 });
  }
}
