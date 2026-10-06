// Authored OLX: attributes that must not span lines.
//
// This exists because of a real defect. A formatting pass that rewrapped long
// lines in a content file to match its surrounding style also caught two
// <Key value="..."> attributes and two placeholders, leaving values like
//
//   value="insufficient consumption of
//           fruits and vegetables"
//
// which is a different string from the one the author wrote. It parsed cleanly,
// typechecked, and passed every other test, because everything else validates
// STRUCTURE and nothing asserted on attribute VALUES. It shipped in that state
// for a long stretch before anyone noticed.
//
// The rule is not "no newlines". Plenty of authored values legitimately contain
// them — Mermaid graph definitions, embedded prompts, a placeholder written as
// several numbered steps — and those newlines are meaningful.
//
// What is never meaningful is a newline FOLLOWED BY INDENTATION. That is the
// signature of a value reflowed to match the surrounding XML layout: an author
// writing a genuine multi-line value starts the next line at the beginning,
// whereas a rewrap leaves the source file's indentation inside the string. So
// that shape is the thing this test looks for, in attributes that carry a single
// logical value, plus <Key value>, which is a stored answer and can never
// usefully contain a newline at all.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'glob';

/** A newline followed by indentation: a value reflowed to match source layout. */
const REFLOWED = /\n[ \t]+/;

/** Attributes carrying one logical value, where a reflow corrupts it. */
const SINGLE_LINE = [
  'id', 'target', 'label', 'title', 'placeholder',
  'slots', 'verdicts', 'max', 'showChecks',
  'labels', 'categories', 'ref', 'src',
];

/** Comments are prose and may wrap freely. */
function stripComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, '');
}

type Offence = { file: string; attr: string; value: string };

function offences(file: string): Offence[] {
  const src = stripComments(readFileSync(file, 'utf-8'));
  const found: Offence[] = [];

  for (const m of src.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
    const [, attr, value] = m;
    if (SINGLE_LINE.includes(attr) && REFLOWED.test(value)) {
      found.push({ file, attr, value: value.split('\n')[0].trim().slice(0, 60) });
    }
  }

  // <Key value="..."> is a stored answer; a newline in it is always a mistake.
  for (const tag of src.match(/<Key\b[^>]*>/g) ?? []) {
    const v = /value\s*=\s*"([^"]*)"/.exec(tag);
    if (v && v[1].includes('\n')) {
      found.push({ file, attr: 'Key value', value: v[1].split('\n')[0].trim().slice(0, 60) });
    }
  }
  return found;
}

const FILES = globSync('content/**/*.olx');

describe('authored OLX attribute values', () => {
  it('finds content to check', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it('has no attribute value reflowed into the source indentation', () => {
    const all = FILES.flatMap(offences);
    // Reported per offence so a failure names the file and attribute rather
    // than just a count.
    expect(all.map(o => `${o.file}: ${o.attr}="${o.value}…"`)).toEqual([]);
  });
});
