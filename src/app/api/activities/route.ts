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
import { getEditPathFromProvenance } from '@/lib/lofs/contentPaths';
import { getBestVariantServer } from '@/lib/i18n/getBestVariant';
import type { ContentTier, ContentVariant } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { idMap, errors } = await syncContentFromStorage();

    // Filter to launchable entries and transform to activity cards
    const activities = Object.fromEntries(
      Object.entries(idMap)
        .filter(([_, variantMap]: [string, any]) => {
          // Include if ANY variant is launchable (not locale-dependent)
          return Object.values(variantMap).some((olxJson: any) =>
            olxJson.attributes?.launchable === 'true'
          );
        })
        .map(([id, variantMap]: [string, any]) => {
          // Transform nested OlxJson structure into activity card
          const availableVariants = Object.keys(variantMap);

          // Build localized title and description
          const title: Record<ContentVariant, string> = {};
          const description: Record<ContentVariant, string> = {};
          const availableVariantsMap: Record<ContentVariant, ContentTier> = {};

          for (const variant of availableVariants) {
            const olxJson = variantMap[variant];
            // Only include launchable variants
            if (olxJson.attributes?.launchable === 'true') {
              title[variant] = olxJson.attributes?.title || id;
              description[variant] = olxJson.description || '';
              // Compute tier from generated field
              availableVariantsMap[variant] = olxJson.generated ? 'bestEffort' : 'supported';
            }
          }

          // Get edit path from provenance
          const bestVariant = getBestVariantServer(request, availableVariants);
          const bestEntry = variantMap[bestVariant];
          const editPathResult = getEditPathFromProvenance(bestEntry.provenance);
          const editPath = editPathResult.valid ? editPathResult.relativePath : null;

          return [
            id,
            {
              id,
              category: bestEntry.category || 'other',
              tag: bestEntry.tag,
              editPath,
              title,
              description,
              availableVariants: availableVariantsMap,
              provenance: bestEntry.provenance
            }
          ];
        })
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
