import { parseIdMap } from '@/app/graph/[id]/page';

const idMap = {
  lesson: { tag: 'Lesson', kids: [ { type: 'xblock', id: 'text1' }, { type: 'xblock', id: 'panel1' } ] },
  text1: { tag: 'TextBlock', kids: [] },
  panel1: { tag: 'SideBarPanel', kids: { main: [ { type: 'xblock', id: 'text2' } ], sidebar: [ { type: 'xblock', id: 'num1' } ] } },
  text2: { tag: 'TextBlock', kids: [] },
  num1: { tag: 'NumberInput', kids: [] },
};

describe('parseIdMap', () => {
  it('extracts edges using staticKids where available', () => {
    const { edges, issues } = parseIdMap(idMap);
    const edgeIds = edges.map(e => e.id);
    expect(edgeIds).toEqual([
      'lesson->text1',
      'lesson->panel1',
      'panel1->text2',
      'panel1->num1'
    ]);
    expect(issues).toEqual([]);
  });
});
