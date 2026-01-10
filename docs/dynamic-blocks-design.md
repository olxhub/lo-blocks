# Dynamic Block Loading: Design Analysis

## Problem Statement

Given `Block.js` + `_Block.tsx` as strings (in memory, postgres, wherever):
1. How do we turn them into a usable `LoBlock`?
2. How do we hot-replace them without restarting?

---

## Key Insight: Hot Replacement is Nearly Free

Looking at `render.tsx:111-124`:
```typescript
if (!blockRegistry[tag] || !blockRegistry[tag].component) {
  return <DisplayError ... />;
}
const blockType = blockRegistry[tag];
```

The registry lookup happens at **render time**. Parsed content stores `{ tag: 'DoneBlock', ... }` — just the string. This means:

```typescript
// Hot replacement is trivial:
BLOCK_REGISTRY['DoneBlock'] = newVersion;
// Next render picks it up automatically
```

The hard part is: **how do we compile source strings into a runnable module?**

---

## The Compilation Problem

Block source has imports:
```typescript
import { core } from '@/lib/blocks';
import _DoneBlock from './_DoneBlock';
```

The browser can't resolve these. Three approaches:

### Approach A: Server-side Bundling (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│  Block Source (strings)                                      │
│  ├── DoneBlock.ts                                           │
│  └── _DoneBlock.tsx                                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Server: POST /api/blocks/compile                            │
│                                                              │
│  esbuild.build({                                            │
│    stdin: { contents: source, loader: 'tsx' },              │
│    bundle: true,                                            │
│    format: 'esm',                                           │
│    external: ['react', '@lo-blocks/runtime'],               │
│  })                                                          │
│                                                              │
│  Output: self-contained ESM with runtime imports             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Compiled Bundle (served at /dynamic-blocks/DoneBlock.js)   │
│                                                              │
│  import { core, parsers, state } from '@lo-blocks/runtime'; │
│  import React from 'react';                                  │
│                                                              │
│  function _DoneBlock({ id, fields }) { ... }                │
│  export default core({ ... });                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Client: Dynamic Import                                      │
│                                                              │
│  const module = await import('/dynamic-blocks/DoneBlock.js')│
│  BLOCK_REGISTRY['DoneBlock'] = module.default;              │
└─────────────────────────────────────────────────────────────┘
```

**The Runtime Bundle**: Provide a single import that exposes everything blocks need:

```typescript
// @lo-blocks/runtime - exposed globally or via import map
export { core, test, dev } from '@/lib/blocks';
export * as parsers from '@/lib/content/parsers';
export * as state from '@/lib/state';
export { useBlockState } from '@/lib/state';
// ... etc
```

**Import Map** (browser-native, avoids bundler magic):
```html
<script type="importmap">
{
  "imports": {
    "react": "/vendor/react.js",
    "@lo-blocks/runtime": "/lib/block-runtime.js"
  }
}
</script>
```

### Approach B: Transform + Function() (Simpler, Less Clean)

Transform imports to runtime lookups, wrap in Function():

```typescript
// Original source
import { core } from '@/lib/blocks';
import { useBlockState } from '@/lib/state';

// Transformed (babel/esbuild transform)
const { core } = __RUNTIME__['@/lib/blocks'];
const { useBlockState } = __RUNTIME__['@/lib/state'];

// ... rest of code ...

return core({ ... });
```

```typescript
// Loader
const RUNTIME = {
  '@/lib/blocks': { core, test, dev },
  '@/lib/state': { useBlockState, fields },
  'react': React,
};

function loadBlock(transformedSource: string): LoBlock {
  const factory = new Function('__RUNTIME__', transformedSource);
  return factory(RUNTIME);
}
```

**Pros**: No import maps, works everywhere
**Cons**: Loses ESM semantics, needs source transform, harder to debug

### Approach C: esbuild-wasm in Browser

Same as A, but run esbuild client-side. ~2.5MB wasm download, but no server needed.

---

## Complete Implementation Sketch

### 1. Block Runtime Module

```typescript
// src/lib/blocks/runtime.ts
// Single module exposing everything dynamic blocks need

export { core, test, dev, blocks } from './factory';
export { createGrader } from './createGrader';
export * as parsers from '@/lib/content/parsers';
export * as state from '@/lib/state';
export { useBlockState, useBlockField } from '@/lib/state';
export { useKids, useBlock } from '@/lib/render';

// Re-export React so blocks don't need separate import
export { default as React } from 'react';
```

### 2. Compilation Endpoint

```typescript
// src/app/api/blocks/compile/route.ts
import * as esbuild from 'esbuild';

export async function POST(req: Request) {
  const { name, sources } = await req.json();
  // sources: { 'DoneBlock.ts': '...', '_DoneBlock.tsx': '...' }

  // Create virtual filesystem for esbuild
  const entryPoint = `${name}.ts`;

  const result = await esbuild.build({
    stdin: {
      contents: sources[entryPoint],
      loader: 'tsx',
      resolveDir: '/virtual',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    // These come from import map at runtime
    external: ['react', '@lo-blocks/runtime'],
    plugins: [
      // Resolve local imports from sources object
      {
        name: 'virtual-fs',
        setup(build) {
          build.onResolve({ filter: /^\./ }, args => {
            const resolved = args.path.replace(/^\.\//, '');
            return { path: resolved, namespace: 'virtual' };
          });
          build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
            const content = sources[args.path] || sources[`${args.path}.tsx`];
            return { contents: content, loader: 'tsx' };
          });
        },
      },
    ],
    write: false,
  });

  const code = result.outputFiles[0].text;

  // Store compiled bundle
  const version = Date.now();
  const url = `/dynamic-blocks/${name}-${version}.js`;
  await storeBundle(url, code);

  return Response.json({ ok: true, url, version });
}
```

### 3. Client-side Loader

```typescript
// src/lib/blocks/dynamicLoader.ts
import { BLOCK_REGISTRY } from '@/components/blockRegistry';

interface LoadedBlock {
  block: LoBlock;
  url: string;
  version: number;
  loadedAt: Date;
}

const loadedBlocks = new Map<string, LoadedBlock>();

export async function loadDynamicBlock(url: string): Promise<LoBlock> {
  // Dynamic import with cache-bust
  const module = await import(/* webpackIgnore: true */ url);
  const block = module.default;

  if (!block?._isBlock) {
    throw new Error(`Module at ${url} is not a valid LoBlock`);
  }

  // Register in global registry
  const name = block.OLXName || block.name;
  BLOCK_REGISTRY[name] = block;

  // Track for debugging/hot-reload
  loadedBlocks.set(name, {
    block,
    url,
    version: Date.now(),
    loadedAt: new Date(),
  });

  return block;
}

export async function reloadBlock(name: string, newUrl: string): Promise<LoBlock> {
  // Load new version
  const block = await loadDynamicBlock(newUrl);

  // Old references in parsed content still have tag: 'DoneBlock'
  // Next render will pick up new version from registry
  // No re-parse needed (unless parser changed significantly)

  return block;
}

export function getLoadedBlocks(): Map<string, LoadedBlock> {
  return new Map(loadedBlocks);
}
```

### 4. Hook for Components that Need Dynamic Blocks

```typescript
// src/lib/blocks/useDynamicBlock.ts
import { useState, useEffect } from 'react';
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import { loadDynamicBlock } from './dynamicLoader';

interface DynamicBlockState {
  block: LoBlock | null;
  loading: boolean;
  error: string | null;
}

export function useDynamicBlock(
  tag: string,
  dynamicUrl?: string
): DynamicBlockState {
  const [state, setState] = useState<DynamicBlockState>(() => {
    // Check if already in registry
    const existing = BLOCK_REGISTRY[tag];
    if (existing) {
      return { block: existing, loading: false, error: null };
    }
    return { block: null, loading: !!dynamicUrl, error: null };
  });

  useEffect(() => {
    // Already have it
    if (BLOCK_REGISTRY[tag]) {
      setState({ block: BLOCK_REGISTRY[tag], loading: false, error: null });
      return;
    }

    // No URL to load from
    if (!dynamicUrl) {
      setState({ block: null, loading: false, error: `Block "${tag}" not found` });
      return;
    }

    // Load dynamically
    setState(s => ({ ...s, loading: true }));
    loadDynamicBlock(dynamicUrl)
      .then(block => {
        setState({ block, loading: false, error: null });
      })
      .catch(err => {
        setState({ block: null, loading: false, error: err.message });
      });
  }, [tag, dynamicUrl]);

  return state;
}
```

### 5. Integration with Render

The current `render.tsx` already handles missing blocks gracefully:

```typescript
if (!blockRegistry[tag] || !blockRegistry[tag].component) {
  return <DisplayError message={`No component found for tag "${tag}"`} />;
}
```

For dynamic blocks, we'd add a loading state. But since content knows which blocks it needs at parse time, we can pre-load:

```typescript
// During content load (in useContentLoader or similar)
async function loadContentWithDynamicBlocks(id: string) {
  const { idMap, dynamicBlocks } = await fetch(`/api/content/${id}`).then(r => r.json());

  // Pre-load any dynamic blocks this content needs
  await Promise.all(
    dynamicBlocks.map(({ tag, url }) => loadDynamicBlock(url))
  );

  // Now all blocks are in registry, content can render synchronously
  return idMap;
}
```

---

## Source Storage

Where do `Block.js` + `_Block.tsx` live?

### Option 1: Filesystem (Development)
```
/dynamic-blocks/
  DoneBlock/
    DoneBlock.ts
    _DoneBlock.tsx
    compiled/
      DoneBlock-1704067200.js
```

### Option 2: PostgreSQL (Production)
```sql
CREATE TABLE dynamic_blocks (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sources JSONB NOT NULL,  -- { "DoneBlock.ts": "...", "_DoneBlock.tsx": "..." }
  compiled_url TEXT,
  compiled_at TIMESTAMP,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dynamic_block_versions (
  id UUID PRIMARY KEY,
  block_id UUID REFERENCES dynamic_blocks(id),
  version INTEGER NOT NULL,
  sources JSONB NOT NULL,
  compiled_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Option 3: Redux (Ephemeral/Development)
```typescript
// For LLM-generated blocks during a session
dispatch({
  type: 'DYNAMIC_BLOCK_ADDED',
  payload: {
    name: 'DoneBlock',
    sources: { 'DoneBlock.ts': '...', '_DoneBlock.tsx': '...' },
    compiledUrl: '/dynamic-blocks/DoneBlock-123.js',
  }
});
```

---

## Sandboxing Considerations (Future)

When sandboxing becomes relevant, the cleanest approach is **iframe isolation**:

```typescript
// Dynamic block runs in sandboxed iframe
// Communicates via postMessage
// Main app provides:
//   - State read/write via messages
//   - Render output as serializable React tree

// This is a significant architecture change, but the module loading
// approach described above is compatible with it.
```

For now, trust the code. The compilation/loading infrastructure is the same either way.

---

## Summary

1. **Compilation**: Server-side esbuild bundles `Block.ts` + `_Block.tsx` into single ESM
2. **Runtime deps**: Import map provides `react` and `@lo-blocks/runtime`
3. **Loading**: `await import(url)` + register in `BLOCK_REGISTRY`
4. **Hot replace**: Just update `BLOCK_REGISTRY[name]` — next render picks it up
5. **Storage**: Postgres for production, filesystem for dev, Redux for ephemeral

The parsed content stores tag names (strings), not block references, so hot replacement requires no re-parsing — just re-render.
