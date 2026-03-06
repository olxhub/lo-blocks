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
 *     [id: OlxKey]: {
 *       id: OlxKey,
 *       category: string,
 *       tag: string,
 *       editPath: string | null,
 *       title: { [variant: ContentVariant]: string },
 *       description: { [variant: ContentVariant]: string },
 *       availableVariants: { [variant: ContentVariant]: 'supported' | 'bestEffort' },
 *       provenance: string[]
 *     }
 *   }
 * }
 */

import { NextRequest } from 'next/server';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { buildActivityCards } from '@/lib/content/buildActivityCards';
import { getBestVariantServer } from '@/lib/i18n/getBestVariant';

export async function GET(request: NextRequest) {
  try {
    const { idMap, errors } = await syncContentFromStorage();

    const activities = buildActivityCards(
      idMap,
      (variants) => getBestVariantServer(request, variants)
    );

    return Response.json({
      ok: true,
      activities,
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
