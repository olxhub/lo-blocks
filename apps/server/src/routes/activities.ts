// apps/server/src/routes/activities.ts
//
// Ported from apps/web/app/api/activities/route.ts (Next.js API route).
//
// GET /api/activities
//
// Returns a list of launchable activities with i18n-aware cards.
// Each activity card contains all the information needed for students/teachers
// to pick which activity to engage with.
//
// Response:
// {
//   ok: boolean,
//   activities: {
//     [id: DefinitionKey]: {
//       id: DefinitionKey,
//       category: string,
//       tag: string,
//       editSource: string,   // origin to open in Studio (?source=)
//       editPath: string,     // repo-relative path within it (?file=)
//       title: { [variant: ContentVariant]: string },
//       description: { [variant: ContentVariant]: string },
//       availableVariants: { [variant: ContentVariant]: 'supported' | 'bestEffort' },
//       provenance: string[]
//     }
//   },
//   warnings: [{ blockId, editSource, message }],  // content warnings (e.g. bad launchable=)
//   errors: [...]                                   // per-file sync errors
// }

import type { Context } from 'hono';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { buildActivityCards } from '@/lib/catalog/buildActivityCards';
import { getBestVariantFromHeader } from '@/lib/i18n/getBestVariant';

export async function handleActivities(c: Context): Promise<Response> {
  try {
    const { idMap, errors } = await syncContentFromStorage();

    const acceptLanguage = c.req.header('accept-language') ?? null;
    const { cards: activities, warnings } = buildActivityCards(
      idMap,
      (variants) => getBestVariantFromHeader(acceptLanguage, variants)
    );

    return c.json({
      ok: true,
      activities,
      warnings,
      errors
    });
  } catch (err: any) {
    console.error('Error loading activities:', err);
    return c.json(
      {
        ok: false,
        error: err.message || 'Failed to load activities'
      },
      500
    );
  }
}
