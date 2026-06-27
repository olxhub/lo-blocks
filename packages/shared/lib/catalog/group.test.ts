// @vitest-environment node
//
// groupByScenario — intra-repo scenario grouping for the catalog.

import { describe, it, expect } from 'vitest';
import { groupByScenario } from './group';
import type { Launchable } from './schema';

function L(id: string, role: Launchable['role'], index: number, title = id): Launchable {
  return { id, role, status: 'usable', title, type: 'X', index, path: `${id}.olx`, forgeLink: null };
}

describe('groupByScenario', () => {
  it('leads each scenario with its course and excludes it from activities', () => {
    const groups = groupByScenario([
      L('edu.memphis.psych/psych_sba', 'activity', 0, 'Part One'),
      L('edu.memphis.psych/psych_course', 'course', 0, 'Sleep Refusal'),
      L('edu.memphis.psych.defiance/psych_course', 'course', 0, 'Child Defiance'),
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

  it('orders activities by index, then title', () => {
    const groups = groupByScenario([
      L('ns/c', 'course', 0),
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
});
