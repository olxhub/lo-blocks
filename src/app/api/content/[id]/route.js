// src/app/api/content/[id]/route.js
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { getEditPathFromProvenance } from '@/lib/storage/contentPaths';

/**
 * Add editPath and editError to an entry based on its provenance.
 * editPath is the content-relative path for editing.
 * editError explains why editing isn't available (if applicable).
 */
function addEditInfo(entry) {
  const result = getEditPathFromProvenance(entry.provenance);
  if (result.valid) {
    return { ...entry, editPath: result.relativePath };
  } else {
    return { ...entry, editPath: null, editError: result.error };
  }
}

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const { idMap } = await syncContentFromStorage();

    // TODO: Break out into /api/content/root
    if (id === 'root') {
      const launchableEntries = Object.fromEntries(
        Object.entries(idMap)
          .filter(([_, val]) => val?.attributes?.launchable === 'true')
          .map(([key, val]) => [key, addEditInfo(val)])
      );

      return Response.json({
        ok: true,
        idMap: launchableEntries
      });
    }

    // TODO: Break out into /api/content/root
    if (id === 'all') {
      return Response.json({
        ok: true,
        idMap
      });
    }

    // TODO: Break out into /api/content/by-id/[id]/
    if (!id || !idMap[id]) {
      return Response.json(
        {
          ok: false,
          error: `No content found for ID: ${id}`,
        },
        { status: 404 }
      );
    }

    return Response.json({
      ok: true,
      idMap
    });
  } catch (error) {
    console.error('Error loading content:', error);

    return Response.json(
      {
        ok: false,
        error: error.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
