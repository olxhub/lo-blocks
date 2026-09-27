#!/usr/bin/env node
// packages/shared/scripts/materialiseRubrics.ts
//
// Build step: expand `<ItemTemplate>` in OLX rubrics, and resolve NOTHING else.
//
// WHY THIS EXISTS. Three artifacts, and until now only two of them existed:
//
//   authored            templates unexpanded, `{{corpus:...}}` intact   (source)
//   EXPANDED/UNRESOLVED templates expanded,   `{{corpus:...}}` intact   <- this
//   .stage/content      templates expanded,   references resolved      (served)
//
// The scorer needs the middle one and there was nowhere to get it. It cannot
// read the authored file once a template exists, because that would mean
// implementing the template grammar a second time -- "a second implementation
// of one rule is the drift this whole model exists to end", which is
// `materialiseRubric`'s own opening line. And it cannot read the staged copy,
// because the references there are RESOLVED: the scorer's generator writes that
// prose back into a public repository, so reading resolved text would replace
// every reference with the student sentence it protects, silently. Measured
// 2026-09-22 -- pointing the reader at the stage made all three handouts read
// OUT OF DATE, and the diff was the reference replaced by its expansion.
//
// So this runs BEFORE `resolveCorpusRefs`, and that ordering is the whole point:
// expansion is structural and resolution is textual, and doing them in one pass
// would make the only artifact that can be safely read the one that cannot be.
//
//   npx tsx packages/shared/scripts/materialiseRubrics.ts --content <dir> [--out <dir>] [--check]
//
//   --out     copy the content tree to <dir> and expand THERE. Like
//             `resolveCorpusRefs --out`, and for the same reason: expanding in
//             place would consume the templates in the file someone edits.
//   --check   expand in memory and report, writing nothing. Exits 1 if any
//             rubric cannot be expanded.
//
// IT DOES NOT REFORMAT. A file with no template is copied byte for byte, and in
// a file with one, every element that did not change is emitted from its own
// SOURCE SPAN rather than re-serialised. `materialiseRubric` pushes unchanged
// nodes through by reference, so identity is what distinguishes them -- no
// comparison, no guessing. Today no rubric declares a template, so the whole
// tree must come through unchanged, and the test asserts exactly that.
import fs from 'node:fs';
import path from 'node:path';
import { xmlParser, elementTag, elementKids, XML_META } from '@/lib/content/xmlParser';
import type { RawXmlNode } from '@/lib/content/xmlParser';
import { NEVER_STAGE, copyTree, stageSources } from './resolveCorpusRefs';
import { materialiseRubric, warnings, resetWarnings } from '@/lib/llm/materialiseRubric';
import type { RubricNode } from '@/lib/llm/materialiseRubric';

// The one list, from the module that owns the mounting rule.
const NEVER_COPY = NEVER_STAGE;

/** A file worth opening: one that could contain a template. */
export function mightHoldATemplate(src: string): boolean {
  return src.includes('<ItemTemplate');
}

function toRubricNode(n: RawXmlNode): RubricNode | null {
  const tag = elementTag(n);
  if (!tag) return null;                       // #text / #comment
  const kids = elementKids(n, tag);
  let text = '';
  const children: RubricNode[] = [];
  for (const k of kids) {
    if (elementTag(k) === undefined) {
      const t = (k as Record<string, unknown>)['#text'];
      if (typeof t === 'string') text += t;
      continue;
    }
    const c = toRubricNode(k);
    if (c) children.push(c);
  }
  return { kind: tag, attrs: (n[':@'] as Record<string, string>) ?? undefined,
           text, children };
}

const escText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// NEWLINES BECOME `&#10;` IN AN ATTRIBUTE, because XML normalises literal ones
// to spaces on the way back in. A judging rule that spans lines would come out
// as one run-on line, and nothing downstream would report it.
const escAttr = (s: string) =>
  escText(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

export function serialise(n: RubricNode, indent: string): string {
  const attrs = Object.entries(n.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escAttr(String(v))}"`).join('');
  const kids = (n.children ?? []);
  const body = n.text ?? '';
  if (!kids.length && !body) return `${indent}<${n.kind}${attrs}/>`;
  if (!kids.length) return `${indent}<${n.kind}${attrs}>${escText(body)}</${n.kind}>`;
  const inner = kids.map(c => serialise(c, indent + '  ')).join('\n');
  return `${indent}<${n.kind}${attrs}>\n${inner}\n${indent}</${n.kind}>`;
}

/** Expand one .olx's rubrics. Returns the new text, or null if nothing changed. */
export function expandFile(src: string, where: string): string | null {
  if (!mightHoldATemplate(src)) return null;
  const tree = xmlParser.parse(src) as RawXmlNode[];
  const idx = tree.findIndex(n => elementTag(n) === 'Rubric');
  if (idx < 0) return null;
  const rubric = tree[idx];
  const kids = elementKids(rubric, 'Rubric');

  // SOURCE SPANS, so an untouched element is emitted as its own bytes. A child's
  // span runs from its own `startIndex` to the NEXT element's -- which carries
  // the whitespace after it too, so re-joining reproduces the original exactly.
  const elems: Array<{ node: RubricNode; start: number }> = [];
  for (const k of kids) {
    if (elementTag(k) === undefined) continue;
    const meta = (k as Record<symbol, unknown>)[XML_META] as { startIndex?: number } | undefined;
    if (meta?.startIndex === undefined) {
      throw new Error(`${where}: a <${elementTag(k)}> has no source position; ` +
                      `the parser must run with captureMetaData`);
    }
    const node = toRubricNode(k);
    if (node) elems.push({ node, start: meta.startIndex });
  }
  if (!elems.length) return null;

  const closeAt = src.lastIndexOf('</Rubric>');
  const spanOf = (i: number) =>
    src.slice(elems[i].start, i + 1 < elems.length ? elems[i + 1].start : closeAt);
  const byNode = new Map<RubricNode, number>(elems.map((e, i) => [e.node, i]));

  resetWarnings();
  const out = materialiseRubric(elems.map(e => e.node));
  for (const w of warnings) console.warn(`  ${where}: ${w}`);

  // A NODE THAT CAME BACK BY REFERENCE DID NOT CHANGE. `materialiseRubric`
  // pushes them through with `out.push(n)`, so identity is exact -- there is no
  // structural comparison here to get subtly wrong.
  const parts: string[] = [src.slice(0, elems[0].start)];
  for (const n of out) {
    const i = byNode.get(n);
    parts.push(i === undefined ? serialise(n, '  ') + '\n  ' : spanOf(i));
  }
  parts.push(src.slice(closeAt));
  const text = parts.join('');
  return text === src ? null : text;
}

// THE COPY ITSELF CAME FROM `resolveCorpusRefs` TOO. `NEVER_STAGE` was
// exported to this module because the exclusion SET had been duplicated --
// "a second copy of the mounting rule is how the two would come to disagree
// about what the content is" -- but the FUNCTION around it stayed duplicated,
// and the two did exactly that: the resolver learned to stage only a content
// collection and this copy went on taking the whole tree, symlinks and all, so
// the trimmed stage refilled itself the moment both had run. One function now.

function main(argv: string[]): number {
  const ci = argv.indexOf('--content');
  const dir = ci >= 0 ? argv[ci + 1] : './content';
  const oi = argv.indexOf('--out');
  const outDir = oi >= 0 ? argv[oi + 1] : null;
  const check = argv.includes('--check');
  if (outDir && check) {
    console.error('materialiseRubrics: --out and --check are alternatives');
    return 1;
  }
  if (!fs.existsSync(dir)) {
    console.error(`materialiseRubrics: no content directory at ${dir}`);
    return 1;
  }
  const files: string[] = [];
  const seen = new Set<string>();
  const walk = (d: string) => {
    // FOLLOW SYMLINKED DIRECTORIES, for the reason `resolveCorpusRefs` records:
    // a content tree mounts other repositories by symlink, and the plain form
    // walks straight past a mounted course and reports a clean zero.
    const real = fs.realpathSync(d);
    if (seen.has(real)) return;
    seen.add(real);
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (NEVER_COPY.has(e.name)) continue;
      const p = path.join(d, e.name);
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        try { isDir = fs.statSync(p).isDirectory(); } catch { continue; }
      }
      if (isDir) walk(p); else if (e.name.endsWith('.olx')) files.push(p);
    }
  };
  walk(dir);

  if (outDir) {
    // NO `rm -rf` HERE. Deleting the tree and repopulating it leaves a window,
    // hundreds of milliseconds wide, in which the staged rubric DOES NOT EXIST
    // -- and a concurrent reader gets `FileNotFoundError` rather than a stale
    // answer. `copyTree` now writes each file beside its destination and
    // renames it into place, which is atomic, so the tree is continuously
    // readable and a re-stage is invisible to anyone reading it.
    //
    // STALE FILES ARE STILL REMOVED, below, once the new set is known: a file
    // that left the source must leave the stage, which is what the `rm -rf` was
    // really for. Doing it afterwards costs one extra walk and removes the
    // window.
    const before = new Set<string>();
    if (fs.existsSync(outDir)) {
      const seenBefore = new Set<string>();
      const walkOut = (d: string) => {
        const real = fs.realpathSync(d);
        if (seenBefore.has(real)) return;
        seenBefore.add(real);
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const q = path.join(d, e.name);
          if (e.isDirectory()) walkOut(q); else before.add(q);
        }
      };
      walkOut(outDir);
    }
    fs.mkdirSync(outDir, { recursive: true });
    // THE SAME SET OF FILES THE RESOLVER STAGES, from the same function. The
    // mounted courses are where the rubrics actually live -- the fallback tree
    // is demos -- so staging only `dir` would expand nothing and report a clean
    // zero, which is exactly what a tree with no templates also looks like.
    stageSources(dir, outDir, 'materialiseRubrics');
    copyTree(dir, outDir);
    files.length = 0;
    seen.clear();
    walk(outDir);
    // THE DELETE, MOVED AFTER THE WRITE. Anything that was in the stage and is
    // not in it now is stale and goes; everything else was overwritten in place
    // by an atomic rename and was never missing.
    const now = new Set<string>();
    const seenAfter = new Set<string>();
    const walkNow = (d: string) => {
      const real = fs.realpathSync(d);
      if (seenAfter.has(real)) return;
      seenAfter.add(real);
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const q = path.join(d, e.name);
        if (e.isDirectory()) walkNow(q); else now.add(q);
      }
    };
    walkNow(outDir);
    for (const stale of before) {
      if (!now.has(stale)) { try { fs.rmSync(stale); } catch { /* raced */ } }
    }
  }
  let changed = 0, withTemplates = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (mightHoldATemplate(src)) withTemplates++;
    let text: string | null;
    try {
      text = expandFile(src, path.relative(outDir ?? dir, f));
    } catch (err) {
      console.error(`  ${path.relative(dir, f)}: ${(err as Error).message}`);
      return 1;
    }
    if (text === null) continue;
    changed++;
    if (outDir) fs.writeFileSync(f, text);      // `f` is already under outDir
  }
  console.log(`  materialiseRubrics: ${files.length} .olx, ${withTemplates} with a ` +
              `template, ${changed} expanded` +
              (outDir ? ` -> ${outDir}` : check ? ' (checked, nothing written)' : ''));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('materialiseRubrics.ts')) {
  process.exit(main(process.argv.slice(2)));
}
