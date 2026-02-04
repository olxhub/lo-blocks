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
 *     [id]: {
 *       id: string,
 *       category: string,
 *       tag: string,
 *       editPath: string,
 *       title: { [locale]: string },
 *       description: { [locale]: string },
 *       availableLocales: { [locale]: 'human' | 'auto' },
 *       provenance: string[]
 *     }
 *   }
 * }
 */

import { NextRequest } from 'next/server';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { getEditPathFromProvenance } from '@/lib/lofs/contentPaths';
import { getBestLocaleServer } from '@/lib/i18n/getBestLocale';

export async function GET(request: NextRequest) {
  try {
    const { idMap } = await syncContentFromStorage();

    // Filter to launchable entries and transform to activity cards
    const activities = Object.fromEntries(
      Object.entries(idMap)
        .filter(([_, langMap]: [string, any]) => {
          // langMap is { 'en-Latn-US': OlxJson, 'ar-Arab-SA': OlxJson, ... }
          const availableLocales = Object.keys(langMap);
          const bestLocale = getBestLocaleServer(request, availableLocales);
          if (!bestLocale) return false;  // Skip entries with no valid locales
          const olxJson = langMap[bestLocale];
          return olxJson?.attributes?.launchable === 'true';
        })
        .map(([id, langMap]: [string, any]) => {
          // Transform nested OlxJson structure into activity card
          const availableLocales = Object.keys(langMap);

          // Build localized title and description
          const title: Record<string, string> = {};
          const description: Record<string, string> = {};
          const availableLocalesMap: Record<string, string> = {};

          for (const locale of availableLocales) {
            const olxJson = langMap[locale];
            if (olxJson) {
              title[locale] = olxJson.attributes?.title || id;
              description[locale] = (olxJson as any).description || '';
              // TODO: Track source (human vs auto) - for now default to 'human'
              availableLocalesMap[locale] = 'human';
            }
          }

          // Get edit path from provenance
          const bestLocale = getBestLocaleServer(request, availableLocales);
          const bestEntry = bestLocale ? langMap[bestLocale] : null;
          const editPathResult = getEditPathFromProvenance(bestEntry?.provenance);
          const editPath = editPathResult.valid ? editPathResult.relativePath : null;

          return [
            id,
            {
              id,
              category: bestEntry?.category || 'other',
              tag: bestEntry?.tag || 'unknown',
              editPath,
              title,
              description,
              availableLocales: availableLocalesMap,
              provenance: bestEntry?.provenance || []
            }
          ];
        })
    );

    return Response.json({
      ok: true,
      activities
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
