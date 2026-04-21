// src/app/api/docs/grammar/[name]/route.js
//
// Individual grammar API - thin wrapper over lib/docs/grammar.
// See ../DESIGN.md for architectural decisions.
//
import { getGrammarMetadata } from '@/lib/docs/grammar';

export async function GET(request, { params }) {
  const { name } = await params;
  const context = new URL(request.url).searchParams.get('context') || undefined;

  try {
    const result = await getGrammarMetadata(name, { context });
    if (!result.ok) {
      return Response.json(result, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    console.error(`Error loading grammar '${name}':`, error);
    return Response.json(
      { ok: false, error: error.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
