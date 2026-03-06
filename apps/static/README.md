# apps/static -- Static site compiler for OLX content

Produces self-contained static sites from OLX content packages. The output is a directory of HTML/CSS/JS files deployable to S3, CDN, GitHub Pages, Netlify, etc.

Think [ncase.me](https://ncase.me/)-style interactive explorations: client-side React for interactivity, no server required.

## Quick start

```bash
# 1. Build grammars, block registry, etc.
npm run build

# 2. Export content as static JSON (uses ./content/ by default)
npm run build:static-content

# 3. Build the static site
npx next build apps/static

# 4. Serve locally to verify
npx serve apps/static/out
```

Or all at once: `npm run build:static`

## Route manifest

The manifest maps URL paths to OLX block IDs. Place a `static.config.json` in your content directory:

```json
{
  "title": "My Workshop",
  "routes": {
    "/": "workshop_intro",
    "/exercise/1": "exercise_one",
    "/exercise/2": "exercise_two"
  }
}
```

Route keys are URL paths. Values are OlxKeys (the `id=` attribute on your root blocks). If no manifest is found, a default is generated from all launchable activities.

## Content sources

By default, the build script reads from `./content/`. Override with:

```bash
npx tsx packages/shared/scripts/xml2json.ts --static-dir apps/static/public/static-content --content /path/to/my-workshop/content
```

The `--manifest` flag selects the source manifest to validate:

```bash
npx tsx packages/shared/scripts/xml2json.ts \
  --static-dir apps/static/public/static-content \
  --content ./my-workshop/content \
  --manifest ./my-workshop/static.config.json
```

## Architecture

This app shares the rendering engine (`packages/shared/`) with `apps/web/` but composes it differently:

| | apps/web (dynamic) | apps/static |
|---|---|---|
| Content loading | `fetchOlxJson` hits `/api/content/[id]` | `StaticContentProvider` loads pre-baked JSON |
| Routing | Fixed (`/preview/[id]`, `/studio`, etc.) | Manifest-driven catch-all |
| Chrome | AppHeader, dev tools, studio | Minimal |
| Output | Server-rendered app | `output: 'export'` -- static files |

No `IS_STATIC` environment variables. No conditionals in shared code. The static app simply has a different content loading path.

### How it works

1. **Build step** (`xml2json.ts --static-dir`): Parses all OLX via the same `syncContentFromStorage` pipeline used by the API routes. Writes `all.json` (full idMap), `activities.json`, and `manifest.json` to `apps/static/public/static-content/`.

2. **`StaticContentProvider`**: Client-side React context that fetches `/static-content/all.json` once on page load and dispatches to Redux. All blocks then access content from the Redux store, same as in the dynamic app.

3. **Catch-all route** (`[...slug]/page.tsx`): Server component that reads the manifest at build time. `generateStaticParams()` enumerates all routes so Next.js pre-renders each one.

4. **`StaticPage`**: Client component that reads idMap from context and renders `<RenderOLX>`.

### File structure

```
apps/static/
  app/
    layout.tsx              # Root layout: Redux store + StaticContentProvider
    page.tsx                # Root route (/)
    storeWrapper.tsx        # Simplified Redux wrapper (no debug panel/replay)
    [...slug]/
      page.tsx              # Catch-all route with generateStaticParams
      StaticPage.tsx        # Client component: renders RenderOLX
    fonts.ts, globals.css   # Shared styles
  lib/
    StaticContentProvider.tsx   # Loads baked JSON, provides via React context
    manifest.ts                 # Manifest type definitions and utilities
  next.config.mjs           # output: 'export'
  public/
    static-content/          # Written by build step (not committed)
```

## Known limitations

- **Server-dependent blocks fail silently**: LLM blocks (`Chat`, `LLMAction`, `LLMFeedback`) make API calls to `/api/...` endpoints that don't exist in a static export. They will render but produce errors when invoked. Avoid including them in static content, or wrap them in content that degrades gracefully.

- **No inter-page navigation**: Each page is standalone. The manifest defines routes but the static site has no built-in header or nav bar linking them. Navigation between pages requires direct URL entry or external links.

- **Per-page metadata**: All pages share the same `<title>` from layout.tsx. No `generateMetadata()` per route yet — social sharing and browser tabs show the generic title.

- **Full content bundle**: `all.json` contains the entire idMap (currently ~2 MB). For large content packages this grows linearly. Tree-shaking is impractical due to the dynamic content DAG (`UseDynamic`, computed refs).

- **No translanguage support**: Static builds bake content at build time. Server-mediated language negotiation doesn't apply. The browser locale is detected for selecting among pre-baked variants, but dynamic translation features are unavailable.

## Future directions

- **Git content sources**: `--content git@github.com:org/repo.git` (clone, parse, build)
- **Block/feature exclusion**: Manifest fields to exclude LLM blocks, etc. Filter at build time.
- **Glob route patterns**: `"/demos/*": "demos/"` to auto-map content directories
- **Custom layouts**: Per-route layout configuration in the manifest
- **Per-page SEO**: `generateMetadata()` pulling titles from block attributes or manifest
- **Navigation component**: Optional `<StaticNav />` reading routes from manifest
- **Content splitting**: Lazy-load content per route instead of one large `all.json`
