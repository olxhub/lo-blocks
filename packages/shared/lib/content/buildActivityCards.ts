// packages/shared/lib/content/buildActivityCards.ts
//
// Extracts activity cards from a parsed idMap. Used by both the
// /api/activities route (with locale-aware variant picking) and
// the xml2json build script (with first-variant fallback).

import type { IdMap, ContentVariant, ContentTier } from '../types';
import { source, addressPath } from '../types/address';
import { variantMapKeys } from '../types/i18n';

export type VariantPicker = (availableVariants: ContentVariant[]) => ContentVariant;

/** Recognized values for the `launchable` OLX attribute. Anything not in this
 *  set is a content error — the block is skipped and a warning is collected so
 *  it can surface on the repo card (via DisplayError).
 *
 *  TODO: Surface these warnings on the repo card as DisplayError. Currently
 *  warnings are returned but tool.ts doesn't propagate them to the per-repo
 *  error field. A typo in any community repo should show on that repo's card,
 *  not crash the whole catalog. */
const LAUNCHABLE_VALUES = new Set(['true', 'course', 'internal', 'other']);

export interface ActivityCard {
  id: string;
  category: string;
  /** Author-declared ordering hint (metadata `index:`); undefined when undeclared. */
  index?: number;
  tag: string;
  /** Origin to open in Studio (the `source` of the block's provenance). */
  editSource: string;
  /** Repo-relative path within that origin. */
  editPath: string;
  title: Record<ContentVariant, string>;
  description: Record<ContentVariant, string>;
  availableVariants: Record<ContentVariant, ContentTier>;
  /** Declaration role (courseware-model). From the `launchable` attribute value:
   *  "course" → course, "internal" → internal, "other" → other, else (incl.
   *  "true") → activity. */
  role: 'course' | 'activity' | 'internal' | 'other';
  /** Draft vs usable, from the `draft` attribute. Catalog hides drafts by default. */
  status: 'draft' | 'usable';
}

/** A content warning from buildActivityCards — not fatal, but should be
 *  surfaced to the author (e.g. on the repo card via DisplayError). */
export interface ActivityCardWarning {
  blockId: string;
  /** Origin of the block (same as ActivityCard.editSource). */
  editSource: string;
  message: string;
}

export interface BuildActivityCardsResult {
  cards: Record<string, ActivityCard>;
  warnings: ActivityCardWarning[];
}

/**
 * Build activity cards from an idMap.
 *
 * Filters to entries with at least one launchable variant, then extracts
 * card metadata. The pickVariant callback selects which variant to use
 * for non-localized metadata (editPath, category, etc.); defaults to
 * first available variant.
 *
 * Content errors (e.g. unrecognized launchable values) are collected in
 * `warnings` rather than thrown — a bad block in one repo must not crash
 * the catalog for every other repo.
 */
export function buildActivityCards(
  idMap: IdMap,
  pickVariant: VariantPicker = (variants) => variants[0]
): BuildActivityCardsResult {
  const warnings: ActivityCardWarning[] = [];

  const cards = Object.fromEntries(
    Object.entries(idMap)
      .filter(([id, variantMap]: [string, any]) => {
        return Object.values(variantMap).some((olxJson: any) => {
          const val = olxJson.attributes?.launchable;
          if (!val) return false;
          if (!LAUNCHABLE_VALUES.has(val)) {
            warnings.push({
              blockId: id,
              editSource: String(source(olxJson.source ?? '')),
              message:
                `Unrecognized launchable="${val}" on block "${id}". ` +
                `Supported values: ${[...LAUNCHABLE_VALUES].join(', ')}.`,
            });
            return false;
          }
          return true;
        });
      })
      .map(([id, variantMap]: [string, any]) => {
        const availableVariants = variantMapKeys(variantMap);

        const title: Record<ContentVariant, string> = {};
        const description: Record<ContentVariant, string> = {};
        const availableVariantsMap: Record<ContentVariant, ContentTier> = {};

        for (const variant of availableVariants) {
          const olxJson = variantMap[variant];
          if (LAUNCHABLE_VALUES.has(olxJson.attributes?.launchable)) {
            title[variant] = olxJson.attributes?.title || id;
            description[variant] = olxJson.description || '';
            availableVariantsMap[variant] = olxJson.generated ? 'bestEffort' : 'supported';
          }
        }

        const bestVariant = pickVariant(availableVariants);
        const bestEntry = variantMap[bestVariant];

        const launchableVal = bestEntry.attributes?.launchable;
        const role: 'course' | 'activity' | 'internal' | 'other' =
          launchableVal === 'course' ? 'course'
          : launchableVal === 'internal' ? 'internal'
          : launchableVal === 'other' ? 'other'
          : 'activity';
        const status: 'draft' | 'usable' =
          bestEntry.attributes?.draft ? 'draft' : 'usable';

        return [
          id,
          {
            id,
            category: bestEntry.category || 'other',
            index: bestEntry.index,
            tag: bestEntry.tag,
            role,
            status,
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

  return { cards, warnings };
}
