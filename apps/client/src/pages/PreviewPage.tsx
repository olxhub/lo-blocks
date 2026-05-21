// apps/client/src/pages/PreviewPage.tsx
//
// Preview page — renders a single block by ID, fetching content dynamically
// from /api/olxjson/. Adapted from apps/web/app/preview/[id]/PreviewPage.tsx
// with Next.js useParams replaced by a prop from the router.
//
import { useState } from 'react';
import RenderOLX from '@/components/common/RenderOLX';
import Spinner from '@/components/common/Spinner';
import { DisplayError } from '@/lib/util/debug';
import { useFieldState, settings } from '@/lib/state';
import { useContentLoader } from '@/lib/content/useContentLoader';
import { parseDefinitionKey } from '@/lib/types/id-grammar';
import { useLocaleAttributes } from '@/lib/i18n/useLocaleAttributes';
import type { ComponentError } from '@/lib/types';

export default function PreviewPage({ id }: { id: string }) {
  const olxKey = parseDefinitionKey(id);
  const [debug] = useFieldState(
    null,
    settings.debug,
    false,
    { tag: 'preview' }
  );

  const { idMap, error, loading } = useContentLoader(olxKey);
  const [renderError, setRenderError] = useState<ComponentError>(null);
  const localeAttrs = useLocaleAttributes();

  if (error) {
    return (
      <div {...localeAttrs} className="flex flex-col h-screen">
        <div className="p-6 flex-1">
          <DisplayError
            props={{ id: olxKey, tag: 'preview' }}
            title="Content Loading Error"
            message={`Failed to load content: ${olxKey}`}
            technical={error}
            id={`${olxKey}_load_error`}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div {...localeAttrs} className="flex flex-col h-screen">
        <Spinner>Loading content...</Spinner>
      </div>
    );
  }

  if (!idMap) {
    return (
      <div {...localeAttrs} className="flex flex-col h-screen">
        <div className="p-6 flex-1">
          <DisplayError
            props={{ id: olxKey, tag: 'preview' }}
            title="No Content"
            message={`No content found for ID: ${olxKey}`}
            id={`${olxKey}_no_content`}
          />
        </div>
      </div>
    );
  }

  return (
    <div {...localeAttrs} className="flex flex-col h-screen">
      <div className="p-6 flex-1 overflow-auto">
        <div className="space-y-4">
          {renderError ? (
            <DisplayError
              props={{ id: olxKey, tag: 'preview' }}
              title="Render Error"
              message={`Failed to render content: ${olxKey}`}
              technical={renderError}
              id={`${olxKey}_render_error`}
            />
          ) : (
            <RenderOLX
              id={olxKey}
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
  );
}
