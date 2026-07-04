// packages/shared/components/blocks/navigation/Catalog/group.ts
//
// Intra-repo structure for the catalog: group a repo's launchables into
// scenarios. A scenario is a namespace — typically one Course plus the
// activities beneath it (e.g. "Psychology Study Group — Sleep Refusal" and its
// SBLA parts). Pure over the get_repositories result, so the view stays
// declarative. See docs/ux.md (the front-door design) and courseware-model.

import type { Launchable } from '@/lib/types';

export interface ScenarioGroup {
  /** Namespace shared by the group's blocks (e.g. "edu.memphis.psych"). */
  namespace: string;
  /** The Course heading this scenario, if one is declared. When present it is
   *  the group's heading and is NOT repeated among `activities`. */
  course?: Launchable;
  /** Launchable activities in this scenario (role ≠ course), in author order. */
  activities: Launchable[];
}

/** Namespace prefix of a launchable id ("ns/leaf" → "ns"). */
function namespaceOf(id: string): string {
  const slash = id.indexOf('/');
  return slash === -1 ? id : id.slice(0, slash);
}

/** Author order: declared index first (undeclared sorts last), title as a
 *  stable tiebreak. */
function byIndexThenTitle(a: Launchable, b: Launchable): number {
  return ((a.index ?? Infinity) - (b.index ?? Infinity)) || a.title.localeCompare(b.title);
}

/**
 * Group launchables into scenarios by namespace. Each group leads with its
 * Course (if any); the remaining launchables become its ordered activities.
 *
 * Groups are ordered course-first (by the course's index), then by namespace
 * for stability — so "edu.memphis.psych" (Sleep Refusal) precedes
 * "edu.memphis.psych.defiance" (Child Defiance).
 */
export function groupByScenario(launchables: Launchable[]): ScenarioGroup[] {
  const byNs = new Map<string, Launchable[]>();
  for (const l of launchables) {
    const ns = namespaceOf(l.id);
    const list = byNs.get(ns) ?? [];
    list.push(l);
    byNs.set(ns, list);
  }

  const groups: ScenarioGroup[] = [];
  for (const [namespace, items] of byNs) {
    const course = items.find(l => l.role === 'course');
    const activities = items.filter(l => l !== course).sort(byIndexThenTitle);
    groups.push({ namespace, course, activities });
  }

  return groups.sort((a, b) => {
    const ai = a.course?.index ?? Infinity;
    const bi = b.course?.index ?? Infinity;
    return (ai - bi) || a.namespace.localeCompare(b.namespace);
  });
}
