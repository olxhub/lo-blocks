// src/app/preview/[ns]/[id]/PreviewPage.tsx
'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import AppHeader from '@/components/common/AppHeader';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { useFieldState, settings, UrlFieldProvider } from '@/lib/state';
import { useContentLoader } from '@/lib/content/useContentLoader';
import { parseDefinitionKey } from '@/lib/types/id-grammar';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import { ComponentError } from '@/lib/types';

export default function PreviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  // Route is /preview/[ns]/[id] — reconstruct DefinitionKey as "ns/id"
  const definitionKey = parseDefinitionKey(`${params.ns}/${params.id}`);
  // TODO: Pass baselineProps from useBaselineProps() instead of null
  const [debug] = useFieldState(
    null,
    settings.debug,
    false,
    { tag: 'preview' } // HACK: This works around not having proper props. Should be fixed. See below
  );

  const { idMap, error, loading } = useContentLoader(definitionKey);
  const [renderError, setRenderError] = useState<ComponentError>(null);
  const localeAttrs = useLocaleAttributes();

  if (error) {
    return (
      <div {...localeAttrs} suppressHydrationWarning className="flex flex-col h-screen">
        <AppHeader home user />
        <div className="p-6 flex-1">
          <DisplayError
            props={{ id: definitionKey, tag: 'preview' }}
            title="Content Loading Error"
            message={`Failed to load content: ${definitionKey}`}
            technical={error}
            id={`${definitionKey}_load_error`}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div {...localeAttrs} suppressHydrationWarning className="flex flex-col h-screen">
        <AppHeader home user />
        <Spinner>Loading content...</Spinner>
      </div>
    );
  }

  if (!idMap) {
    return (
      <div {...localeAttrs} suppressHydrationWarning className="flex flex-col h-screen">
        <AppHeader home user />
        <div className="p-6 flex-1">
          <DisplayError
            props={{ id: definitionKey, tag: 'preview' }}
            title="No Content"
            message={`No content found for ID: ${definitionKey}`}
            id={`${definitionKey}_no_content`}
          />
        </div>
      </div>
    );
  }

  return (
    <UrlFieldProvider searchParams={searchParams}>
      <div {...localeAttrs} className="flex flex-col h-screen">
        <AppHeader home user />
        <div className="p-6 flex-1 overflow-auto">
          <div className="space-y-4">
            {renderError ? (
              <DisplayError
                props={{ id: definitionKey, tag: 'preview' }}
                title="Render Error"
                message={`Failed to render content: ${definitionKey}`}
                technical={renderError}
                id={`${definitionKey}_render_error`}
              />
            ) : (
              <RenderOLX
                id={definitionKey}
                baseIdMap={idMap}
                eventContext="preview"
                onError={(err) => setRenderError(err.message)}
              />
            )}
          </div>

          {debug && (
            <pre className="mt-4 bg-gray-100 p-4 text-xs rounded overflow-auto">
              {JSON.stringify({ idMap }, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </UrlFieldProvider>
  );
}

// TODO for hack above
// We have a hack where useFieldState requires props. We should do several things:
// * Make a 'global' or 'common' props object to use outside of render. Use a sentinel tag and ID
//   - Consider a shared props constructor or factory, so things don't go out of sync?
//   - 2 might places might not be enough to merit that.
// * Remove need for tag and ID in contexts we don't need it (e.g. system-wide state)
//
// This hack is present in debug.js (twice), AppHeader, and here
