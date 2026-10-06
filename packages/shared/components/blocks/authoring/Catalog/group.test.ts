// @vitest-environment node
//
// groupByScenario — intra-repo scenario grouping for the catalog.

import { describe, it, expect } from 'vitest';
import { groupByScenario } from './group';
import type { Launchable } from '@/lib/types';

function L(
  id: string, role: Launchable['role'], index: number, title = id, members?: string[],
): Launchable {
  return {
    id, role, status: 'usable', title, type: 'X', index, path: `${id}.olx`, forgeLink: null,
    ...(members ? { members } : {}),
  };
}

describe('groupByScenario', () => {
  it('leads each scenario with its course and excludes it from activities', () => {
    const groups = groupByScenario([
      L('edu.memphis.psych/psych_sba', 'activity', 0, 'Part One'),
      L('edu.memphis.psych/psych_course', 'course', 0, 'Sleep Refusal',
        ['edu.memphis.psych/psych_sba']),
      L('edu.memphis.psych.defiance/psych_course', 'course', 0, 'Child Defiance',
        ['edu.memphis.psych.defiance/psych_sba']),
      L('edu.memphis.psych.defiance/psych_sba', 'activity', 0, 'Part One'),
    ]);

    expect(groups.map(g => g.namespace)).toEqual([
      'edu.memphis.psych',           // base namespace sorts before its .defiance child
      'edu.memphis.psych.defiance',
    ]);
    expect(groups[0].course?.title).toBe('Sleep Refusal');
    expect(groups[0].activities.map(a => a.title)).toEqual(['Part One']);  // course not repeated
    expect(groups[1].course?.title).toBe('Child Defiance');
  });

  it('gives each course in a shared namespace its own members', () => {
    // edu.memphis.psych holds two courses. Grouping by namespace put every
    // activity under whichever course was found first, so Behaviour
    // Modification's handouts showed under the Study Group and vice versa.
    const groups = groupByScenario([
      L('ns/study_course', 'course', 0, 'Study Group', ['ns/sba', 'ns/consent']),
      L('ns/bmod_course', 'course', 1, 'Behaviour Modification',
        ['ns/handout1', 'ns/handout2']),
      L('ns/sba', 'activity', 0, 'SBLA Part One'),
      L('ns/consent', 'activity', 1, 'Consent Form'),
      L('ns/handout1', 'activity', 0, 'BMod Handout 1'),
      L('ns/handout2', 'activity', 1, 'BMod Handout 2'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.course?.title)).toEqual(['Study Group', 'Behaviour Modification']);
    expect(groups[0].activities.map(a => a.title)).toEqual(['SBLA Part One', 'Consent Form']);
    expect(groups[1].activities.map(a => a.title)).toEqual(['BMod Handout 1', 'BMod Handout 2']);
  });

  it('orders activities by index, then title', () => {
    const groups = groupByScenario([
      L('ns/c', 'course', 0, 'ns/c', ['ns/three', 'ns/one', 'ns/four']),
      L('ns/three', 'activity', 3, 'SBLA Part Three'),
      L('ns/one', 'activity', 1, 'SBLA Part One'),
      L('ns/four', 'activity', 4, 'SBLA Part Four'),
    ]);
    expect(groups[0].activities.map(a => a.title)).toEqual([
      'SBLA Part One', 'SBLA Part Three', 'SBLA Part Four',  // index order, not alphabetical
    ]);
  });

  it('handles a namespace with no course', () => {
    const groups = groupByScenario([L('demos/intro', 'activity', 0)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].course).toBeUndefined();
    expect(groups[0].activities).toHaveLength(1);
  });

  it('keeps an activity no course claims, under its namespace', () => {
    const groups = groupByScenario([
      L('ns/c', 'course', 0, 'Course', ['ns/inside']),
      L('ns/inside', 'activity', 0, 'Inside'),
      L('ns/orphan', 'activity', 1, 'Orphan'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].activities.map(a => a.title)).toEqual(['Inside']);
    expect(groups[1].course).toBeUndefined();
    expect(groups[1].activities.map(a => a.title)).toEqual(['Orphan']);
  });
});
