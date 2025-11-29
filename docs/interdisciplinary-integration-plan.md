# Integration Plan: pmitros/interdiscp-play Branch

This document outlines the plan for integrating the `pmitros/interdiscp-play` branch into main. The branch contains new blocks and content for the Interdisciplinary SBA.

## Branch Contents Summary

### New Blocks (4)
| Block | Location in Branch | Target Location | Complexity |
|-------|-------------------|-----------------|------------|
| Collapsible | `src/components/blocks/Collapsible.js` | `src/components/blocks/layout/Collapsible/` | Low |
| Tabs | `src/components/blocks/Tabs.js` | `src/components/blocks/layout/Tabs/` | Low |
| TeamDirectory | `src/components/blocks/TeamDirectory.js` | `src/components/blocks/specialized/TeamDirectory/` | Medium |
| Navigator | `src/components/blocks/Navigator/` | `src/components/blocks/layout/Navigator/` | High |

### Utility Changes
- `src/lib/util/index.ts`: Adds `resolveImagePath()` function
- `src/components/blocks/display/Image/_Image.jsx`: Modified to use shared util

### Content Files
- `content/sba/interdisciplinary_artifact.xml` - Main SBA artifact structure
- `content/sba/interdisciplinary_sba_dialogue.chatpeg` - Dialogue content (~550 lines)
- `content/sba/images/*.png` - Team member photos (6 images, ~1MB each)

### Demo Files (in `content/demos/`)
- `tabs-demo.xml`
- `team-directory-demo.xml`
- `interdisciplinary-sba-demo.xml`
- `interdisciplinary-sba-navigator.xml`
- `navigator-blocks-demo.xml`
- `navigator-documents-demo.xml`
- `navigator-simple-demo.xml`
- `navigator-team-demo.xml`
- `sba-team-integration.xml`

### Extracted Materials (in `interdisciplinary_sba_extracted/`)
- `index.yaml` - Resource catalog
- `*.md` - Research studies and policy documents
- `*.chatpeg` - Chat dialogue files
- `interdisciplinary_sba_flow.txt` - Full SBA flow (~1600 lines)

---

## Integration Phases

### Phase 1: Foundation Utils ✅ READY
**Goal**: Add shared `resolveImagePath` utility without breaking existing functionality.

**Files to modify**:
1. `src/lib/util/index.ts` - Add `resolveImagePath()` function
2. `src/components/blocks/display/Image/_Image.jsx` - Import from util, remove local copy

**Branch source**:
```typescript
// From branch's src/lib/util/index.ts
export function resolveImagePath(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('//')) return src.slice(1);
  const cleanSrc = src.startsWith('/') ? src.slice(1) : src;
  return `/content/${cleanSrc}`;
}
```

**Current main implementation** (in `_Image.jsx`):
```javascript
function resolveImageSrc(src) {
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return { type: 'external', src };
  }
  if (src.startsWith('//')) {
    return { type: 'platform', src: src.slice(2) };
  }
  return { type: 'content', src: src.startsWith('/') ? src.slice(1) : src };
}
```

**Decision**: Keep main's implementation (returns object with type) - more explicit. Just extract to util.

**Test**: Run `npm run test` - Image tests should pass.

---

### Phase 2: Simple Layout Blocks
**Goal**: Add Collapsible and Tabs blocks.

#### 2a. Collapsible Block
**Files to create**:
- `src/components/blocks/layout/Collapsible/Collapsible.js`
- `src/components/blocks/layout/Collapsible/_Collapsible.jsx`
- `src/components/blocks/layout/Collapsible/Collapsible.olx` (demo)

**Key features**:
- Expandable/collapsible content section
- Uses `title` or `label` attribute for header
- State: `expanded` (boolean)

**Test**: Create simple demo, verify expand/collapse works.

#### 2b. Tabs Block
**Files to create**:
- `src/components/blocks/layout/Tabs/Tabs.js`
- `src/components/blocks/layout/Tabs/_Tabs.jsx`
- `src/components/blocks/layout/Tabs/Tabs.olx` (demo)

**Key features**:
- Multiple tab panels
- Gets tab labels from child block's `label` or `title` attribute
- State: `activeTab` (number)

**Test**: Create demo with multiple tabs, verify switching works.

---

### Phase 3: Complex Blocks

#### 3a. TeamDirectory Block
**Files to create**:
- `src/components/blocks/specialized/TeamDirectory/TeamDirectory.js`
- `src/components/blocks/specialized/TeamDirectory/_TeamDirectory.jsx`
- `src/components/blocks/specialized/TeamDirectory/TeamDirectory.olx` (demo)

**Issues to address**:
1. Has hardcoded `DEFAULT_TEAM` data - should be parameterized via child elements
2. Uses `core()` instead of `dev()` - evaluate appropriateness
3. Image paths use `/team/ty.jpg` - need to update to actual content paths

**Refactoring needed**:
- Consider making team data come from OLX children (e.g., `<TeamMember>` blocks)
- Or accept JSON/YAML in text content
- Update image path handling

#### 3b. Navigator Block
**Files to create**:
- `src/components/blocks/layout/Navigator/Navigator.js`
- `src/components/blocks/layout/Navigator/_Navigator.jsx`
- `src/components/blocks/layout/Navigator/NavigatorDefaultDetail.js`
- `src/components/blocks/layout/Navigator/NavigatorDefaultPreview.js`
- (and other template blocks)

**Issues to address**:
1. Marked as "PROTOTYPE" in source comments
2. Has custom YAML parsing (fragile)
3. Uses `parsers.text()` - may need `parsers.blocks()` for template children
4. Multiple sub-components for preview/detail templates

**Refactoring needed**:
- Evaluate if YAML parsing should use a proper parser
- Consider if templates should be child blocks instead of ID references
- May need significant cleanup

---

### Phase 4: Content and Images

**Images to move**:
- `content/sba/images/*.png` → `content/sba/interdisciplinary/images/`

**Content to move**:
- `content/sba/interdisciplinary_artifact.xml` → `content/sba/interdisciplinary/artifact.olx`
- `content/sba/interdisciplinary_sba_dialogue.chatpeg` → `content/sba/interdisciplinary/dialogue.chatpeg`

**Path updates needed**:
- All image references in TeamDirectory default data
- Any hardcoded paths in demos

---

### Phase 5: Demos and Extracted Content

**Demos**: Move relevant demos to block directories as `.olx` files.

**Extracted materials** (`interdisciplinary_sba_extracted/`):
- Evaluate what to keep
- Research study markdown files could become content
- `index.yaml` could inform Navigator data structure
- May keep as reference or integrate selectively

---

## Progress Tracking

- [x] Phase 1: Foundation Utils (completed 2025-11-29)
  - Added `resolveImageSrc()` and `resolveImagePath()` to `src/lib/util/index.ts`
  - Updated `_Image.jsx` to import from shared util
  - All 199 tests pass
- [ ] Phase 2a: Collapsible Block
- [ ] Phase 2b: Tabs Block
- [ ] Phase 3a: TeamDirectory Block
- [ ] Phase 3b: Navigator Block
- [ ] Phase 4: Content and Images
- [ ] Phase 5: Demos and Extracted Content

---

## Commands Reference

```bash
# View branch changes
git diff --name-only main...pmitros/interdiscp-play

# View specific file from branch
git show pmitros/interdiscp-play:path/to/file

# Run tests
npm run test -- --run

# Rebuild block registry after adding blocks
npm run build:gen-block-registry
```
