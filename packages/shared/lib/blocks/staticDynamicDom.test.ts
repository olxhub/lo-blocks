import { parseOLX } from '@/lib/content/parseOLX';
import { getOlxJson, mockRuntime, TEST_NS, testKey } from '@/lib/test-utils';
import { toMemoryRef } from '@/lib/types/storage';
import type { RuntimeProps } from '@/lib/types';
import { selectKidsJson } from './staticDynamicDom';

it('filters when= blocks nested beneath raw HTML', async () => {
  const xml = `<CapaProblem id="q">
    <section><div>
      <Markdown id="shown" when="true">Shown</Markdown>
      <Markdown id="hidden" when="false">Hidden</Markdown>
    </div></section>
    <StringGrader answer="yes"><LineInput /></StringGrader>
  </CapaProblem>`;
  const { idMap } = await parseOLX(xml, [toMemoryRef('test.xml')], undefined, TEST_NS);
  const content = Object.fromEntries(Object.entries(idMap).map(([id, olxJson]) => [
    id, { olxJson, loadingState: { status: 'ready' } },
  ]));
  const props = {
    ...getOlxJson(idMap, 'q'),
    runtime: mockRuntime({ olxJsonSources: ['content'] }),
  } as RuntimeProps;
  const state = { application_state: { olxjson: { content } } };

  const kids = selectKidsJson(props, state);
  const section = kids.find(kid => kid.type === 'html');
  expect(section.kids[0].kids).toEqual([{ type: 'block', id: testKey('shown') }]);
});
