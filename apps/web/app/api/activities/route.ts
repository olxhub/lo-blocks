/**
 * GET /api/activities
 *
 * Returns a list of launchable activities with i18n-aware cards.
 * Each activity card contains all the information needed for students/teachers
 * to pick which activity to engage with.
 *
 * Response:
 * {
 *   ok: boolean,
 *   activities: {
 *     [id: DefinitionKey]: {
 *       id: DefinitionKey,
 *       category: string,
 *       tag: string,
 *       editSource: string,   // origin to open in Studio (?source=)
 *       editPath: string,     // repo-relative path within it (?file=)
 *       title: { [variant: ContentVariant]: string },
 *       description: { [variant: ContentVariant]: string },
 *       availableVariants: { [variant: ContentVariant]: 'supported' | 'bestEffort' },
 *       provenance: string[]
 *     }
 *   },
 *   warnings: [{ blockId, editSource, message }],  // content warnings (e.g. bad launchable=)
 *   errors: [...]                                   // per-file sync errors
 * }
 */

import { NextRequest } from 'next/server';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { buildActivityCards } from '@/lib/content/buildActivityCards';
import { getBestVariantFromHeader } from '@/lib/i18n/getBestVariant';

export async function GET(request: NextRequest) {
  try {
    const { idMap, errors } = await syncContentFromStorage();

    const { cards: activities, warnings } = buildActivityCards(
      idMap,
      (variants) => getBestVariantFromHeader(request.headers.get('accept-language'), variants)
    );

    return Response.json({
      ok: true,
      activities,
      warnings,
      errors
    });
  } catch (err: any) {
    console.error('Error loading activities:', err);
    return Response.json(
      {
        ok: false,
        error: err.message || 'Failed to load activities'
      },
      { status: 500 }
    );
  }
}
