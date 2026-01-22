// src/app/api/grep/route.ts
//
// Content search API.
//
// GET /api/grep?pattern=    - Search file contents for pattern
// GET /api/grep?pattern=&path=&include=&limit=  - With options
//
import { FileStorageProvider } from '@/lib/lofs/providers/file';

const provider = new FileStorageProvider('./content');

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pattern = url.searchParams.get('pattern');

  if (!pattern) {
    return Response.json(
      { ok: false, error: 'pattern parameter is required' },
      { status: 400 }
    );
  }

  const basePath = url.searchParams.get('path') || undefined;
  const include = url.searchParams.get('include') || undefined;
  const limitStr = url.searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  try {
    const matches = await provider.grep(pattern, { basePath, include, limit });
    return Response.json({ ok: true, matches });
  } catch (err: any) {
    console.error(`[API /grep] ${err.message}`);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
