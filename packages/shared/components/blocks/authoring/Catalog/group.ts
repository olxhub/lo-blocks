// packages/shared/components/blocks/authoring/Catalog/group.ts
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
 * Group launchables into scenarios: one group per Course, holding the
 * activities that Course declares as its sections. Whatever no Course claims
 * falls back to a namespace group with no heading.
 *
 * Membership, not namespace, decides. A namespace may hold several courses —
 * edu.memphis.psych holds both "Psychology Study Group" and "Behaviour
 * Modification" — and grouping by namespace put every one of its activities
 * under whichever course happened to be found first.
 *
 * Groups are ordered course-first (by the course's index), then by namespace
 * for stability — so "edu.memphis.psych" (Sleep Refusal) precedes
 * "edu.memphis.psych.defiance" (Child Defiance).
 */
export function groupByScenario(launchables: Launchable[]): ScenarioGroup[] {
  const courses = launchables.filter(l => l.role === 'course');
  const byId = new Map(launchables.map(l => [l.id, l]));

  // Claimed by a course, so it must not also appear in a namespace group.
  // A course listed as another course's section stays a heading of its own;
  // only non-course activities are claimed.
  const claimed = new Set<string>();
  const groups: ScenarioGroup[] = [];

  for (const course of courses) {
    const activities: Launchable[] = [];
    for (const id of course.members ?? []) {
      const member = byId.get(id);
      if (!member || member.role === 'course' || claimed.has(id)) continue;
      claimed.add(id);
      activities.push(member);
    }
    groups.push({
      namespace: namespaceOf(course.id),
      course,
      activities: activities.sort(byIndexThenTitle),
    });
  }

  // Anything no course claims — including repos that declare no course at all.
  const byNs = new Map<string, Launchable[]>();
  for (const l of launchables) {
    if (l.role === 'course' || claimed.has(l.id)) continue;
    const ns = namespaceOf(l.id);
    const list = byNs.get(ns) ?? [];
    list.push(l);
    byNs.set(ns, list);
  }
  for (const [namespace, items] of byNs) {
    groups.push({ namespace, activities: items.sort(byIndexThenTitle) });
  }

  // Namespace first, so a namespace's groups stay adjacent — "edu.memphis.psych"
  // (Sleep Refusal) precedes "edu.memphis.psych.defiance" (Child Defiance).
  // Within one, courses lead in declared index order and the unheaded
  // leftovers sort last.
  return groups.sort((a, b) => {
    const ai = a.course ? (a.course.index ?? Infinity) : Infinity;
    const bi = b.course ? (b.course.index ?? Infinity) : Infinity;
    return a.namespace.localeCompare(b.namespace)
      || (Number(!a.course) - Number(!b.course))
      || (ai - bi)
      || (a.course?.title ?? '').localeCompare(b.course?.title ?? '');
  });
}
