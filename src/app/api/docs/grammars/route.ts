// src/app/api/docs/grammars/route.js
//
// Grammar list API - thin wrapper over lib/docs/grammar.
// See ../DESIGN.md for architectural decisions.
//
import { getAllGrammarsMetadata } from '@/lib/docs/grammar';

export async function GET(request) {
  try {
    const result = await getAllGrammarsMetadata();
    return Response.json(result);
  } catch (error) {
    console.error('Error generating grammar documentation:', error);
    return Response.json(
      { ok: false, error: error.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
