# Dynamic Block Loading

# Note: This is obsolete design documentation
# Current is dynamic-blocks.md

This file was prior to implementation. Should be removed prior to merge.

## Overview

Dynamic blocks allow loading React/TypeScript blocks at runtime without rebuilding the application. A professor or LLM can generate block code, compile it on-the-fly, and use it immediately in content.

## Current Implementation (POC)

### Architecture

```
Block Source (strings)              Runtime Registry
     │                                    │
     ▼                                    │
POST /api/blocks/compile                  │
     │                                    │
     ├─► Transform imports to __R refs    │
     ├─► Bundle with esbuild              │
     ├─► Write to public/dynamic-blocks/  │
     │                                    │
     ▼                                    ▼
dynamic import(url) ──────────────► BLOCK_REGISTRY[name] = block
                                          │
                                          ▼
                                    Content renders with
                                    new block immediately
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/blocks/runtime.ts` | Exports everything dynamic blocks need (React, core, parsers, state, etc.) |
| `src/lib/blocks/dynamicLoader.ts` | `initBlockRuntime()`, `compileAndLoadBlock()`, `reloadBlock()` |
| `src/app/api/blocks/compile/route.ts` | Server-side esbuild compilation |
| `src/app/dynamic-blocks-test/page.tsx` | Test/demo page |

### How It Works

1. **Runtime initialization**: `initBlockRuntime()` exposes the runtime on `globalThis.__LO_BLOCKS_RUNTIME__`

2. **Source transformation**: Imports are rewritten before bundling:
   ```typescript
   // Before
   import { core } from '@/lib/blocks';
   import * as parsers from '@/lib/content/parsers';

   // After
   const { core } = __R;
   const parsers = __R.parsers;
   ```

3. **JSX transformation**: esbuild uses `__R.React.createElement` as the JSX factory

4. **Bundle output**: Self-contained ESM module with runtime header:
   ```javascript
   const __R = globalThis.__LO_BLOCKS_RUNTIME__;
   // ... bundled block code ...
   export default HelloBlock;
   ```

5. **Loading**: Standard dynamic import + registry update:
   ```typescript
   const module = await import(url);
   BLOCK_REGISTRY[name] = module.default;
   ```

6. **Hot replacement**: Just update the registry — next render picks it up automatically (parsed content stores tag names as strings, not block references)

### Block Format

Dynamic blocks use the same format as static blocks:

```typescript
// HelloBlock.tsx
import { core } from '@/lib/blocks';
import * as parsers from '@/lib/content/parsers';
import _HelloBlock from './_HelloBlock';

export default core({
  ...parsers.text(),
  name: 'HelloBlock',
  component: _HelloBlock,
});

// _HelloBlock.tsx
function _HelloBlock({ kids }) {
  return <div>{kids}</div>;
}
export default _HelloBlock;
```

## Vision

### Near-term Goals

1. **LLM authoring integration**: When authoring content, an LLM can spawn a sub-agent to build custom interactives on demand

2. **Professor self-service**: Professors can request blocks ("make a completion toggle") and get working interactives

3. **Build-test-deploy cycle**: Generated blocks are tested before integration; failures are discarded without impact

4. **Persistence**: Blocks stored in git repos or postgres, pulled into courses as needed

5. **Soft isolation**: Blocks use defined APIs (not arbitrary DOM access), limiting blast radius to their own page

### Architecture Evolution

**Current state**: POC with regex-based import transformation

**Next steps**:
- Robust import parsing (handle edge cases, multi-line, comments)
- Cleanup of compiled artifacts (`npm run clean`)
- Better error messages for compilation failures
- Block validation before registration

**Future considerations**:
- Block versioning (git-style, possibly actual git)
- State migration when blocks are upgraded
- Per-course or per-institution block namespaces
- Iframe isolation for untrusted blocks (not 2026)

## API Reference

### `initBlockRuntime()`
Call once before loading any dynamic blocks. Exposes the runtime globally.

### `compileAndLoadBlock(name, sources)`
Compile and register a block in one step.
```typescript
await compileAndLoadBlock('HelloBlock', {
  'HelloBlock.tsx': '...',
  '_HelloBlock.tsx': '...',
});
```

### `reloadBlock(name, sources)`
Hot-reload an existing block with new source.

### `compileBlock(name, sources)`
Compile only, returns `{ ok, url, version, error }`.

### `loadDynamicBlock(url)`
Load a pre-compiled bundle from URL.

## Configuration

- `next.config.mjs`: `serverExternalPackages: ['esbuild']` — keeps esbuild server-side only
- `.gitignore`: `public/dynamic-blocks` — compiled bundles are ephemeral

## Known Limitations

1. **Import transformation**: Current regex-based approach may miss edge cases (multi-line imports, imports in comments). Consider using a proper parser.

2. **No cleanup**: Old compiled bundles accumulate in `public/dynamic-blocks/`

3. **No validation**: Blocks are registered without checking they're well-formed

4. **No versioning**: Multiple versions of the same block aren't tracked

5. **Browser caching**: May need cache-busting for updated blocks
