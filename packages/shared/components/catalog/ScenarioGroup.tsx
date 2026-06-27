'use client';
// packages/shared/components/catalog/ScenarioGroup.tsx
//
// One scenario within a repo: a Course and the activities beneath it (e.g.
// "Psychology Study Group — Sleep Refusal" and its SBLA parts). The Course is
// the heading; its parts indent under it so a bare "Part One" reads in context.

import type { Repository } from '@/lib/catalog/schema';
import type { ScenarioGroup as Group } from '@/lib/catalog/group';
import ActivityRow from './ActivityRow';

/** Readable label for a scenario that has no Course to name it — the last
 *  namespace segment, title-cased ("…psych.defiance" → "Defiance"). */
function scenarioLabel(namespace: string): string {
  const leaf = namespace.slice(namespace.lastIndexOf('.') + 1);
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}

export default function ScenarioGroup({ repo, group }: { repo: Repository; group: Group }) {
  const { course, activities } = group;
  return (
    <div className="flex flex-col">
      {course ? (
        <ActivityRow repo={repo} launchable={course} prominent />
      ) : (
        <h4 className="text-sm font-semibold text-secondary pt-1 pb-1">{scenarioLabel(group.namespace)}</h4>
      )}
      <div className="pl-3 ml-1 border-l border-border-subtle">
        {activities.map(a => <ActivityRow key={a.id} repo={repo} launchable={a} />)}
      </div>
    </div>
  );
}
