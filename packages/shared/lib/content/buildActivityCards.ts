// packages/shared/lib/content/buildActivityCards.ts
//
// Extracts activity cards from a parsed idMap. Used by both the
// /api/activities route (with locale-aware variant picking) and
// the xml2json build script (with first-variant fallback).

import type { IdMap, ContentVariant, ContentTier } from '../types';
import { source, addressPath } from '../types/address';
import { variantMapKeys } from '../types/i18n';

export type VariantPicker = (availableVariants: ContentVariant[]) => ContentVariant;

export interface ActivityCard {
  id: string;
  category: string;
  index: number;
  tag: string;
  /** Origin to open in Studio (the `source` of the block's provenance). */
  editSource: string;
  /** Repo-relative path within that origin. */
  editPath: string;
  title: Record<ContentVariant, string>;
  description: Record<ContentVariant, string>;
  availableVariants: Record<ContentVariant, ContentTier>;
}

/**
 * Build activity cards from an idMap.
 *
 * Filters to entries with at least one launchable variant, then extracts
 * card metadata. The pickVariant callback selects which variant to use
 * for non-localized metadata (editPath, category, etc.); defaults to
 * first available variant.
 */
export function buildActivityCards(
  idMap: IdMap,
  pickVariant: VariantPicker = (variants) => variants[0]
): Record<string, ActivityCard> {
  return Object.fromEntries(
    Object.entries(idMap)
      .filter(([_, variantMap]: [string, any]) => {
        return Object.values(variantMap).some((olxJson: any) =>
          olxJson.attributes?.launchable === 'true'
        );
      })
      .map(([id, variantMap]: [string, any]) => {
        const availableVariants = variantMapKeys(variantMap);

        const title: Record<ContentVariant, string> = {};
        const description: Record<ContentVariant, string> = {};
        const availableVariantsMap: Record<ContentVariant, ContentTier> = {};

        for (const variant of availableVariants) {
          const olxJson = variantMap[variant];
          if (olxJson.attributes?.launchable === 'true') {
            title[variant] = olxJson.attributes?.title || id;
            description[variant] = olxJson.description || '';
            availableVariantsMap[variant] = olxJson.generated ? 'bestEffort' : 'supported';
          }
        }

        const bestVariant = pickVariant(availableVariants);
        const bestEntry = variantMap[bestVariant];

        return [
          id,
          {
            id,
            category: bestEntry.category || 'other',
            index: bestEntry.index,
            tag: bestEntry.tag,
            // Split the block's provenance ref into the origin to edit in and
            // the repo-relative path within it — Studio's ?source= and ?file=.
            editSource: String(source(bestEntry.source)),
            editPath: String(addressPath(bestEntry.source)),
            title,
            description,
            availableVariants: availableVariantsMap,
          }
        ];
      })
  );
}
