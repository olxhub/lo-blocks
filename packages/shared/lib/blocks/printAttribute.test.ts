// @vitest-environment node
import Tabs from '@/components/blocks/layout/Tabs/Tabs';
import Vertical from '@/components/blocks/layout/Vertical/Vertical';
import { generateOlxSchema } from '@/components/common/CodeEditor/olxSchema';

describe('print modes', () => {
  it('allows block-specific modes without exposing them on other blocks', () => {
    expect(Tabs.attributes.safeParse({ print: 'no-chrome' }).success).toBe(true);
    expect(Tabs.attributes.safeParse({ print: 'false' }).success).toBe(true);
    expect(Vertical.attributes.safeParse({ print: 'no-chrome' }).success).toBe(false);
    expect(Vertical.attributes.safeParse({ print: 'false' }).success).toBe(true);
  });

  it('offers block-specific modes in OLX completion', () => {
    const schema = generateOlxSchema({ Tabs, Vertical });
    const globalPrint = schema.attributes.find(attribute => attribute.name === 'print');
    const tabs = schema.elements.find(element => element.name === 'Tabs');
    const tabsPrint = tabs?.attributes?.find(attribute =>
      typeof attribute !== 'string' && attribute.name === 'print');

    expect(globalPrint?.values).toEqual(['true', 'false']);
    expect(tabsPrint && typeof tabsPrint !== 'string' ? tabsPrint.values : undefined)
      .toEqual(['true', 'false', 'no-chrome']);
  });
});
