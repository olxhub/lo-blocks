import { describe, expect, it, vi } from 'vitest';
import {
  extractInterpolations,
  interpolateStateTemplate,
} from '@/lib/stateLanguage';

const prompt = [
  'Seconds drafting: {{@timer.value}}',
  'Draft: {{@draft.value}}',
].join('\n');

function stateAt(seconds: number, draft: string) {
  return {
    componentState: {
      timer: { value: seconds },
      draft: { value: draft },
    },
  };
}

describe('Chat prompt interpolation', () => {
  it('evaluates state-language expressions in an authored prompt', () => {
    const result = interpolateStateTemplate(
      prompt,
      extractInterpolations(prompt),
      stateAt(65, 'Once upon a time'),
    );

    expect(result).toBe('Seconds drafting: 65\nDraft: Once upon a time');
  });

  it('can resolve the same prompt against fresh state on each turn', () => {
    const interpolations = extractInterpolations(prompt);

    const firstTurn = interpolateStateTemplate(prompt, interpolations, stateAt(5, ''));
    const laterTurn = interpolateStateTemplate(prompt, interpolations, stateAt(3600, 'A draft.'));

    expect(firstTurn).toBe('Seconds drafting: 5\nDraft: ');
    expect(laterTurn).toBe('Seconds drafting: 3600\nDraft: A draft.');
  });

  it('leaves a broken expression visible instead of blanking it', () => {
    const broken = 'Broken: {{@draft.value.nope()}}';
    const onError = vi.fn();

    expect(interpolateStateTemplate(
      broken,
      extractInterpolations(broken),
      stateAt(5, 'A draft.'),
      onError,
    )).toBe(broken);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('renders a missing block as empty rather than throwing', () => {
    const missing = 'Missing: {{@absent.value}}';

    expect(interpolateStateTemplate(
      missing,
      extractInterpolations(missing),
      stateAt(5, 'A draft.'),
    )).toBe('Missing: ');
  });
});
