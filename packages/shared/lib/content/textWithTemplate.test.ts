import { describe, expect, it } from 'vitest';
import { core } from '@/lib/blocks';
import ShowAnswerButton from '@/components/blocks/action/ShowAnswerButton/ShowAnswerButton';
import CodeInput from '@/components/blocks/authoring/CodeInput/CodeInput';
import BlockMath from '@/components/blocks/display/DisplayMath/BlockMath';
import Markdown from '@/components/blocks/display/Markdown/Markdown';
import CustomGrader from '@/components/blocks/grading/CustomGrader';
import NumberInput from '@/components/blocks/input/NumberInput';
import TextArea from '@/components/blocks/input/TextArea';
import Navigator from '@/components/blocks/layout/Navigator/Navigator';
import * as parsers from './parsers';

describe('text parser capabilities', () => {
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
});
