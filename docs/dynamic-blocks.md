# Dynamic Block Loading

## Overview

Dynamic blocks allow loading React/TypeScript blocks at runtime without rebuilding the application. A professor or LLM should be able to generate block code, compile it on-the-fly, and use it immediately in their course.

**Test page**: `/dynamic-blocks-test`

## Architecture

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

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/blocks/runtime.ts` | Exports everything dynamic blocks need |
| `src/lib/blocks/dynamicLoader.ts` | `initBlockRuntime()`, `compileAndLoadBlock()` |
| `src/app/api/blocks/compile/route.ts` | Server-side esbuild compilation |

## Usage

```typescript
import { initBlockRuntime, compileAndLoadBlock } from '@/lib/blocks/dynamicLoader';

// Initialize once
initBlockRuntime();

// Compile and load
await compileAndLoadBlock('HelloBlock', {
  'HelloBlock.tsx': `
    import { core } from '@/lib/blocks';
    import * as parsers from '@/lib/content/parsers';
    import _HelloBlock from './_HelloBlock';
    export default core({ ...parsers.text(), name: 'HelloBlock', component: _HelloBlock });
  `,
  '_HelloBlock.tsx': `
    export default function _HelloBlock({ kids }) {
      return <div>{kids}</div>;
    }
  `,
});

// Block is now available in content:
// <HelloBlock>Hello!</HelloBlock>
```

## How It Works

1. **Runtime init**: `initBlockRuntime()` exposes utilities on `globalThis.__LO_BLOCKS_RUNTIME__`

2. **Import transform**: Before bundling, imports are rewritten:
   ```typescript
   import { core } from '@/lib/blocks';     →  const { core } = __R;
   import * as parsers from '@/lib/...';    →  const parsers = __R.parsers;
   ```

3. **JSX transform**: esbuild uses `__R.React.createElement`

4. **Hot replacement**: Update `BLOCK_REGISTRY[name]` — next render uses new version (parsed content stores tag names, not references)

## Block Format

Same as static blocks:

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
```

## Vision

1. **LLM integration**: Content authoring LLM spawns sub-agent to build interactives
2. **Professor self-service**: "Make a block which allows student to label a VESPR diagram with ..." → working block
3. **Fail-safe**: Test before integration; discard failures
4. **Persistence**: Git repos or postgres, pulled into courses
5. **Soft isolation**: Defined APIs limit blast radius from bugs. In the future, we may have want an iframe sandbox if the threat model expands

## Known Limitations

1. **Import parsing**: Regex-based; may miss multi-line imports or comments
2. **No cleanup**: Old bundles accumulate in `public/dynamic-blocks/`
3. **No versioning**: Single version per block name

---

## To do list

### High Priority (Before Building Many Blocks)

**Robust import transformation**
- Replace regex with proper parser (esbuild's parser, or ts-morph)
- Handle: multi-line imports, comments, string literals containing import-like text
- Breaking change to block format is fine now; won't be later. We'd like a good format shared between static and dynamic blocks

**Validation/Linting**
- Reject `useState`, `useRef` without wrapper (must use `useReduxState`, etc.)
- Require zod schema for attributes
- Require `name`, `component`, parser
- Require `Block.md` and `Block.olx` documentation. First `Block.olx` should be concise, as exhaustive as convenient, and usable as a template. Next ones should dive into use cases.
- Etc.
- LLM can fix iteratively until block passes validation. We want validation scripts and prompts.
- Good to have prompts for common errors
  - These should be logged too. If LLMs / humans make the same bug many times, that's an API issue.

**Design documentation**
- Log discussion with professor
- Extract pedagogy and use cases for documentation

### Medium Priority

**Namespacing**
- Prevent collisions: `dynamic.professor.HelloBlock`
- Per-course or per-institution scopes
- Protected namespaces (can't override `core.*`)

**Cleanup**
- Add to `npm run clean`: remove `public/dynamic-blocks/*`
- Consider: cleanup old versions on new compile

**Error handling**
- Better compilation error messages
- Source maps for debugging
- Validation errors with fix suggestions

### Future (Not 2026)

**Versioning**
- Git-style version tracking (maybe actual git, maybe git format in postgres)
- State migration when blocks upgrade
- Rollback capability
- AB tests / select branch (OLX needs this too!)

**Persistence**
- Store in postgres or git repos
- Pull into courses on demand
- Share across institutions
- Forks, etc.

**Iframe isolation**
- For untrusted blocks
- Communicate via postMessage
- Significant architecture change

---

## Integration Points

**LLM content authoring**
- Sub-agent builds interactives on demand
- Iterative: generate → validate → fix → test → integrate
- Multiple versions can be built / compared
- Failures can be discarded without impact

**Studio namespacing**
- Blocks scoped to editing context
- Professor creates block → available in their course

**Soft isolation model**
- Blocks use defined APIs (`useReduxState`, not `useState`)
- No arbitrary DOM access
- Blast radius limited to own page
- Does not prevent malicious blocks: XSS, etc. 

---

## Test Strategy

### Workflow

```
Professor: "Please build a block to do X"
     │
     ▼
LLM generates block (template + docs + tools provided)
     │
     ▼
Automated validation pipeline:
     ├─► Lint: no useState, required fields, zod schema
     ├─► Compile: esbuild succeeds
     ├─► Render: test against sample OLX, no errors
     ├─► Performance agent: "validate for performance"
     └─► Security agent: "validate for security / XSS / data exfiltration / ..."
     └─► More agents: documentation, pedagogy, i18n, a11y, clean redux, ...
     │
     ▼
Pass → integrate into course
Fail → LLM fixes iteratively or discard
```

### Validation Agents

**Lint/Structure**
- Required exports (`default`, must be `LoBlock`)
- No forbidden APIs (`useState`, raw `fetch`, etc.)
- Zod schema present for attributes
- `name`, `component`, parser defined

Note: This is to prevent bugs, coupling, etc., not security. Security will require a sandbox.

**Render test**
- Generate sample OLX from block metadata
- Parse and render without errors
- Check console for warnings

### Static block parity

Static blocks test against every `.olx` example file. Dynamic blocks should:
- Auto-generate `Example.olx` from attributes/parser
- Run same parse/render tests
- Optionally: professor provides test cases

## Configuration

- `next.config.mjs`: `serverExternalPackages: ['esbuild']`
- `.gitignore`: `public/dynamic-blocks`
