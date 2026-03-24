import { describe, it, expect } from 'vitest';
import { analyzeHighlights } from './analysis';
import type { HighlightSpan } from '@/lib/highlight';
import * as parserModule from '../TextSelection/_textSelectionParser';

const parser = (parserModule as any).default || parserModule;

type Segment = {
  type: 'text' | 'required' | 'optional' | 'feedback_trigger';
  content: string;
  id: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseAnnotated(markedText: string): {
  text: string;
  marks: { content: string; span: HighlightSpan }[];
} {
  const parsed = parser.parse(`Prompt\n---\n${markedText}`);
  const segments = parsed.segments as Segment[];

  const text = segments.map(s => s.content).join('');
  const marks: { content: string; span: HighlightSpan }[] = [];

  let offset = 0;
  for (const seg of segments) {
    if (seg.type === 'required') {
      marks.push({ content: seg.content, span: { offset, length: seg.content.length } });
    }
    offset += seg.content.length;
  }

  return { text, marks };
}

function overlaps(a: HighlightSpan, b: HighlightSpan): boolean {
  return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

function covers(span: HighlightSpan, pos: number): boolean {
  return pos >= span.offset && pos < span.offset + span.length;
}

/**
 * Mode-agnostic assertion: brackets in markedText denote expected highlights.
 * 1. Entry spans cover the start and end of every mark (no false negatives)
 * 2. Every entry span overlaps some marked span (no false positives)
 * 3. If no marks, expect zero spans
 */
function expectHighlights(
  markedText: string,
  m: Parameters<typeof analyzeHighlights>[1],
  options?: { words?: string },
) {
  const { text, marks } = parseAnnotated(markedText);
  const entries = analyzeHighlights(text, m, 'en', options);
  const entrySpans = entries.flatMap(e => e.spans);

  if (marks.length === 0) {
    expect(entrySpans, `expected no highlights for "${text}"`).toHaveLength(0);
    return;
  }

  // No false negatives: entry spans must cover both edges of every mark
  for (const mark of marks) {
    const start = mark.span.offset;
    const end = mark.span.offset + mark.span.length - 1;
    expect(
      entrySpans.some(s => covers(s, start)),
      `missing highlight at start of "${mark.content}" (offset ${start})`,
    ).toBe(true);
    expect(
      entrySpans.some(s => covers(s, end)),
      `missing highlight at end of "${mark.content}" (offset ${end})`,
    ).toBe(true);
  }

  // No false positives: every entry span overlaps some mark
  for (const span of entrySpans) {
    const slice = text.slice(span.offset, span.offset + span.length);
    expect(
      marks.some(m => overlaps(m.span, span)),
      `unexpected highlight "${slice}" at offset ${span.offset}`,
    ).toBe(true);
  }
}

type CaseValue = string | [string, { words: string }];

function mode(m: Parameters<typeof analyzeHighlights>[1]) {
  const check = (markedText: string, options?: { words?: string }) =>
    expectHighlights(markedText, m, options);

  check.each = (cases: Record<string, CaseValue>) => {
    for (const [name, value] of Object.entries(cases)) {
      const [text, opts] = Array.isArray(value) ? value : [value, undefined];
      it(name, () => expectHighlights(text, m, opts));
    }
  };

  return check;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('analyzeHighlights — repeated_words', () => {
  mode('repeated_words').each({
    'case-insensitive':    'The [big] dog and the [big] cat.',
    '3+ times':            '[Hello] [hello] [hello] [HELLO].',
    'no repeats ignored':  'The cat sat on the mat.',
    'punctuation':         '[Go] [go], [go], and [go] again.',
    'empty for no repeats':'The quick fox runs.',
    'ignores stop words':  'The and the and the or the.',
  });
});

describe('analyzeHighlights — sentence_starters', () => {
  mode('sentence_starters').each({
    'repeated + unique':   '[The] cat sat. [The] dog ran. [A] bird flew. [Birds] sing.',
    'all unique':          '[Dogs] run. [Cats] sit.',
    'single sentence':     '[Hello] world.',
    'across paragraphs':   '[Then] dawn came.\n\n[Then] dusk fell.',
    'no repeated starters':'[Hello] world. [Bright] sun.',
  });
});

describe('analyzeHighlights — alliteration', () => {
  mode('alliteration').each({
    'basic run':           'The [cute cat cried] softly.',
    'long run':            '[Sally sells sea shells].',
    'no run':              'The cat ran fast.',
    'stop words in run':   '[America the angle artist].',
    'multiple runs':       '[Big bad] [at all apples].',
    'across sentences':    '[Sally sings. Sam sat.]',
    'long a-run':          '[An American athlete asked about all apples. Although every American asks about] them, he did not know.',
    'no consecutive match':'The bird sang.',
    'two-word pair':       '[Silly Sam].',
  });
});

describe('analyzeHighlights — transition_words', () => {
  mode('transition_words').each({
    'case-insensitive':    ['[However], the plan failed. [Therefore], we tried again.', { words: 'however, therefore, furthermore' }],
    'uppercase match':     ['[HOWEVER], it worked.',                                    { words: 'however' }],
    'multi-word phrase':   ['[On the other hand], it could work.',                      { words: 'on the other hand, however' }],
    'repeated words':      ['[Then], [then].',                                          { words: 'then' }],
    'no cross-sentence':   ['[in fact] it happened. [In another] case it worked.',      { words: 'in fact, in another' }],
    'no match':            ['The cat sat.',                                              { words: 'however, therefore' }],
    'repeated phrases':    ['[In fact], [in fact] then.',                                { words: 'in fact' }],
    'no word list':        'However, it worked.',
  });
});
