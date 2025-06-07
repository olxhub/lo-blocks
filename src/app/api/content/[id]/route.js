import { loadContentTree } from '@/lib/content/loadContentTree';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const { idMap, parsed } = await loadContentTree();

    // TODO: Break out into /api/content/root
    if (id === 'root') {
      const launchableEntries = Object.fromEntries(
        Object.entries(idMap).filter(([_, val]) =>
          val?.attributes?.launchable === 'true'
        )
      );

      return Response.json({
        ok: true,
        idMap: launchableEntries
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
      idMap,
      parsed,
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
