import { beforeEach, describe, expect, it } from 'vitest';
import { core } from '@/lib/blocks';
import ShowAnswerButton from '@/components/blocks/action/ShowAnswerButton/ShowAnswerButton';
import CodeInput from '@/components/blocks/authoring/CodeInput/CodeInput';
import BlockMath from '@/components/blocks/display/DisplayMath/BlockMath';
import Markdown from '@/components/blocks/display/Markdown/Markdown';
import ObservablePlot from '@/components/blocks/display/ObservablePlot/ObservablePlot';
import CustomGrader from '@/components/blocks/grading/CustomGrader';
import NumberInput from '@/components/blocks/input/NumberInput';
import TextArea from '@/components/blocks/input/TextArea';
import Navigator from '@/components/blocks/layout/Navigator/Navigator';
import { createGrader } from '@/lib/blocks/createGrader';
import { contentConfigContext, initConfig } from '@/lib/config';
import { toMemoryRef } from '@/lib/types/storage';
import { TEST_NS, testKey } from '@/lib/test-utils';
import { parseOLX } from './parseOLX';
import * as parsers from './parsers';

const validationContext = contentConfigContext(TEST_NS, toMemoryRef('test.olx'));

describe('text parser capabilities', () => {
  beforeEach(() => {
    initConfig('* { allow-unsafe-content: false; }', { classes: ['test'] });
  });

  it('keeps structural text parsing independent from runtime templates', () => {
    const block = core({
      ...parsers.text(),
      name: 'StructuralTextParserTest',
    });

    expect(block.textContent).toEqual({ source: 'kids' });
    expect(block.attributes.safeParse({ template: 'state' }).success).toBe(false);
  });

  it('adds template= explicitly and composes with target=', () => {
    const block = core({
      ...parsers.textWithTemplate(parsers.text.withTarget()),
      name: 'TargetTemplateTextParserTest',
    });

    expect(block.textContent).toEqual({ source: 'value', defaultTemplateMode: 'none' });
    expect(block.attributes.safeParse({ target: 'other', template: 'state' }).success).toBe(true);
    expect(block.attributes.safeParse({ template: 'mustache' }).success).toBe(false);
  });

  it('preserves Markdown interpolation while new template blocks default to literal text', () => {
    expect(Markdown.textContent).toEqual({ source: 'value', defaultTemplateMode: 'state' });
    expect(BlockMath.textContent).toEqual({ source: 'value', defaultTemplateMode: 'none' });
  });

  it('keeps template= off structural, input, and generated-grader consumers', () => {
    for (const block of [CodeInput, TextArea, Navigator]) {
      expect(block.attributes.safeParse({ template: 'state' }).success).toBe(false);
    }
    expect(CustomGrader.textContent).toBeUndefined();
    expect(CustomGrader.attributes.safeParse({ target: 'answer', template: 'state' }).success).toBe(false);
    expect(NumberInput.childMode).toBe('none');
    expect(ShowAnswerButton.childMode).toBe('none');
  });

  it('preserves custom text postprocessing through the template wrapper', async () => {
    const parser = parsers.textWithTemplate(
      parsers.text({ postprocess: text => `[${text.toUpperCase()}]` }),
    );
    let stored: any;

    await parser.parser({
      id: 'custom_text',
      tag: 'CustomText',
      attributes: {},
      source: 'memory:test',
      parseDeps: [],
      rawParsed: { CustomText: [{ '#text': 'hello' }] },
      storeEntry: (_id: string, entry: unknown) => { stored = entry; },
    });

    expect(stored.kids).toBe('[HELLO\n]');
  });

  it('rejects state interpolation in executable ObservablePlot JavaScript', () => {
    expect(ObservablePlot.validateAttributes?.({ format: 'js', template: 'state' }, validationContext))
      .toEqual([
        'format="js" executes unsandboxed JavaScript and is disabled. ' +
        'Enable allow-unsafe-content only where executable content cannot cross a trust boundary.',
        'template="state" is not supported with format="js": interpolated state ' +
        'would become executable JavaScript. Use YAML or author the JavaScript spec directly.',
      ]);
    expect(ObservablePlot.validateAttributes?.({ format: 'yaml', template: 'state' }, validationContext))
      .toBeUndefined();

    initConfig('* { allow-unsafe-content: true; }', { classes: ['test'] });
    expect(ObservablePlot.validateAttributes?.({ format: 'js' }, validationContext)).toBeUndefined();
    expect(ObservablePlot.validateAttributes?.(
      { format: 'js', template: 'state' },
      validationContext,
    ))
      .toEqual([
        'template="state" is not supported with format="js": interpolated state ' +
        'would become executable JavaScript. Use YAML or author the JavaScript spec directly.',
      ]);
  });

  it('gates CustomGrader behind the contextual unsafe-content policy', () => {
    expect(CustomGrader.validateAttributes?.({ target: ['answer'] }, validationContext)).toEqual([
      'CustomGrader executes unsandboxed JavaScript and is disabled. ' +
      'Enable allow-unsafe-content only where executable content cannot cross a trust boundary.',
    ]);

    initConfig('* { allow-unsafe-content: true; }', { classes: ['test'] });
    expect(CustomGrader.validateAttributes?.({ target: ['answer'] }, validationContext))
      .toBeUndefined();
  });

  it('resolves unsafe JavaScript policy from parse-time source provenance', async () => {
    const xml = `<ObservablePlot id="unsafe_plot" format="js">
      return Plot.plot({ marks: [] });
    </ObservablePlot>`;

    const denied = await parseOLX(xml, [toMemoryRef('unsafe.olx')], undefined, TEST_NS);
    expect(denied.errors).toHaveLength(1);
    expect(denied.errors[0]).toMatchObject({ type: 'attribute_validation' });
    expect(denied.errors[0].message).toContain('allow-unsafe-content');
    expect(denied.idMap[testKey('unsafe_plot')]['*'].tag).toBe('ErrorNode');

    initConfig(`
      * { allow-unsafe-content: false; }
      [origin="memory:trusted"] { allow-unsafe-content: true; }
    `, { classes: ['test'] });
    const allowed = await parseOLX(
      xml,
      [toMemoryRef('unsafe.olx', 'trusted')],
      undefined,
      TEST_NS,
    );
    expect(allowed.errors).toEqual([]);
  });

  it('fails fast when createGrader receives renderer parser capabilities', () => {
    expect(() => createGrader({
      base: 'UnsupportedParserCapabilityTest',
      description: 'test-only grader',
      grader: () => ({ correct: true, message: '' }),
      createMatch: false,
      parser: parsers.text.withTarget(),
    })).toThrow(
      /createGrader\(UnsupportedParserCapabilityTest\).*unsupported helper capabilities: parserMixin/,
    );
  });
});
