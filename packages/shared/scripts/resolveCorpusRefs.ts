#!/usr/bin/env node
// packages/shared/scripts/resolveCorpusRefs.ts
//
// Build step: expand `{{corpus:...}}` references in OLX content.
//
// WHY THIS EXISTS. A handout teaches a rule off a real student answer. Keeping
// that sentence in the content repository means keeping one student's words in
// git forever; keeping it OUT means the page cannot be authored at all. The
// reference splits the difference: the repository carries an address, and the
// text is fetched at build time from the corpus, which lives outside every
// checkout.
//
//     "{{corpus:PR/p1:pr:0:47:sha=543798ac2cea}}" does not work — feeling rested
//     ^ item/participant  ^ field  ^ span  ^ sha of the span
//
// WHERE THE DATA COMES FROM. Not from the corpus directly — this is TypeScript
// and the submissions are .docx. The python side writes the referenced spans to
// a small JSON file (`corpus_ref.py --export-olx-data`), and each .olx names it
// in frontmatter as `corpus_data:`. Only the spans actually referenced are
// exported, so the file is the smallest thing that can serve the page.
//
// IT REFUSES RATHER THAN DEGRADE. An unresolved reference is not left in place
// and not silently dropped: either would put `{{corpus:...}}` in front of a
// student, or quietly delete the example the sentence is built around. A
// missing data file, a missing key, or a span whose sha no longer matches all
// stop the build.
//
//   npx tsx packages/shared/scripts/resolveCorpusRefs.ts --content <dir> [--out <dir>] [--check]
//
//   --check   report what would change and exit 1 if anything is unresolved,
//             without writing. For CI and for the pre-commit path.
//   --out     STAGE: copy the whole content tree to <dir> and resolve THERE.
//             The build uses this and never the in-place form. Resolving in
//             place would replace the reference with the sentence in the
//             authoring tree -- undoing the thing the reference exists to do,
//             and doing it silently, since the built page would look correct.
//             In-place remains available for a deliberate one-off; the build
//             may not use it.
//
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import * as YAML from 'yaml';

// KEPT IN STEP WITH `scoring/corpus_resolve.py`. Two implementations of one
// grammar, and nothing used to check they agreed: `shape=` and `alt=` were added
// to the Python side on 2026-09-15 and not here, so every reference carrying a
// shape stopped matching. The build then reported "0 files with references" and
// would have copied `{{corpus:...}}` into the page a student reads -- a silent
// pass, which is worse than a failure. The psych repo's
// `scoring/check_ref_grammars.py` now refuses a divergence.
//
//   sha=    the span's hash, checked
//   alt=    other cells the same words appear in; ATTRIBUTION ONLY, not resolved
//   shape=  how the occurrence differed from the canonical span, applied on expand
export const CORPUS_REF =
  /\{\{corpus:([A-Za-z0-9]+)\/p(\d+):([A-Za-z0-9_]+):(\d+):(\d+)(?::sha=([0-9a-f]{6,64}))?(?::alt=([A-Za-z0-9/,_]+))?(?::shape=([0-9A-Za-z,\-]+))?\}\}/g;

/** The exported span, put back into the form the file actually held.
 *
 * Mirrors `corpus_resolve.apply_shape`. A reference must reproduce its ORIGINAL
 * BYTES, not merely the right words: text is often quoted with a different case,
 * a wrapped line or a typographic apostrophe, and expanding to the canonical
 * form silently rewrites the file.
 *
 *   S<i>-<hex>  the i-th gap between words is these bytes, not one space
 *   A<i>        the apostrophe at index i is the other glyph
 *   C<hex>      bitmask, little-endian: flip the case of these characters
 */
export function applyShape(span: string, shape?: string): string {
  if (!shape) return span;
  // NO BigInt AND NO Map ITERATION. A case mask can exceed 53 bits, so it is
  // read as a bit ARRAY rather than a number, and the separator table is a
  // plain object -- both so this compiles under the repo's target rather than
  // only under the one `tsx` happens to run.
  const seps: { [k: number]: string } = {};
  const apos: number[] = [];
  let caseBits: number[] | null = null;
  const repl: Array<[number, number, string]> = [];
  for (const op of shape.split(',')) {
    if (!op) continue;
    if (op[0] === 'S') {
      const [i, hex] = op.slice(1).split('-');
      seps[Number(i)] = Buffer.from(hex, 'hex').toString('utf8');
    } else if (op[0] === 'A') {
      apos.push(Number(op.slice(1)));
    } else if (op[0] === 'R') {
      const [i, ln, hx] = op.slice(1).split('-');
      repl.push([Number(i), Number(ln), hx]);
    } else if (op[0] === 'C') {
      const h = op.slice(1);
      caseBits = [];
      for (let k = h.length - 1; k >= 0; k--) {
        const nib = parseInt(h[k], 16);
        for (let j = 0; j < 4; j++) caseBits.push((nib >> j) & 1);
      }
    }
  }
  let out = span;
  const sepKeys = Object.keys(seps);
  if (sepKeys.length) {
    const parts = out.split(/(\s+)/);
    for (const key of sepKeys) {
      const j = 2 * Number(key) + 1;
      if (j < parts.length) parts[j] = seps[Number(key)];
    }
    out = parts.join('');
  }
  if (apos.length) {
    const ch = Array.from(out);
    for (const i of apos) {
      if (i >= 0 && i < ch.length) ch[i] = ch[i] === '’' ? "'" : '’';
    }
    out = ch.join('');
  }
  if (caseBits !== null) {
    const ch = Array.from(out);
    for (let i = 0; i < ch.length; i++) {
      if (caseBits[i]) {
        const c = ch[i];
        ch[i] = c === c.toUpperCase() && c !== c.toLowerCase() ? c.toLowerCase() : c.toUpperCase();
      }
    }
    out = ch.join('');
  }
  if (repl.length) {
    // R<i>-<oldlen>-<hex>: the only length-changing op, so it runs last and
    // right-to-left. A .py source may write an apostrophe as the six characters
    // `\u2019`, and no flip turns one character into six.
    repl.sort((a, b) => b[0] - a[0]);
    for (const [i, ln, hx] of repl) {
      out = out.slice(0, i) + Buffer.from(hx, 'hex').toString('utf8') + out.slice(i + ln);
    }
  }
  return out;
}

export function sha12(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);
}

/** The `corpus_data:` path from an .olx's frontmatter, with $VARS expanded. */
export function corpusDataPath(olx: string): string | null {
  const head = olx.slice(0, 4000);
  const m = head.match(/^\s*corpus_data:\s*(\S+)\s*$/m);
  if (!m) return null;
  return m[1].replace(/\$([A-Z_][A-Z0-9_]*)/g, (_all, name) => {
    const v = process.env[name];
    if (!v) throw new Error(
      `resolveCorpusRefs: ${name} is not set, and corpus_data needs it to find ` +
      `the referenced spans. Set it to the corpus directory.`);
    return v;
  });
}

export function resolve(olx: string, data: Record<string, string>, where: string): string {
  return olx.replace(CORPUS_REF, (_m, item, pid, field, a, b, sha, _alt, shape) => {
    const key = `${item}/p${pid}:${field}:${a}:${b}`;
    const span = data[key];
    if (span === undefined) {
      throw new Error(
        `${where}: no span for ${key}. The .olx references it and the exported ` +
        `data does not carry it -- re-run corpus_ref.py --export-olx-data.`);
    }
    if (sha && sha12(span) !== sha) {
      throw new Error(
        `${where}: SHA MISMATCH for ${key} -- the .olx declares ${sha}, the ` +
        `exported span hashes to ${sha12(span)}. The corpus moved under this ` +
        `reference; do not re-export until someone has read the cell.`);
    }
    return applyShape(span, shape);
  });
}

/** Copy a tree, following symlinks so the copy is genuinely independent.
 *
 * `fs.cpSync(..., { dereference: true })` does NOT do this for a symlinked
 * DIRECTORY -- measured, it reproduces the link -- and a staged tree that still
 * points at the authoring checkout is not staged at all: resolving in it writes
 * through to the source.
 */
/** Every local content root a deployment would serve, plus any it cannot see.
 *
 * WHY NOT JUST `./content`. A course is usually MOUNTED from another checkout,
 * so a tree with nothing mounted has no references in it and the check passes --
 * reporting exactly what a genuinely clean tree reports. That is a false pass
 * with the same signature as every other silent failure here: the guard did not
 * look, and said nothing about not looking.
 *
 * So the roots come from the same config the server uses. A source given as a
 * PATH is scanned. A source given as a git REMOTE cannot be read from here, and
 * is RETURNED AS UNSCANNED rather than skipped, because "I could not check this"
 * and "this is fine" must not print the same way.
 */
export function contentRoots(repoRoot: string): { dirs: string[]; unscanned: string[] } {
  const dirs: string[] = [];
  const unscanned: string[] = [];
  const localCfg = path.join(repoRoot, 'config/content-sources.local.yaml');
  const baseCfg = path.join(repoRoot, 'config/content-sources.yaml');
  // The local file REPLACES the committed one wholesale -- see contentSources.ts.
  const cfgPath = fs.existsSync(localCfg) ? localCfg : baseCfg;
  if (fs.existsSync(cfgPath)) {
    let cfg: any = {};
    try { cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8')) || {}; } catch { cfg = {}; }
    for (const [mount, val] of Object.entries(cfg.sources || {})) {
      if (typeof val === 'string') {
        const d = path.isAbsolute(val) ? val : path.join(repoRoot, val);
        if (fs.existsSync(d)) dirs.push(d);
        else unscanned.push(`${mount}: ${d} (configured, not on disk)`);
      } else {
        const repo = (val as any)?.repo ?? '(unknown)';
        unscanned.push(`${mount}: ${repo} (git remote -- cannot be read from here)`);
      }
    }
  }
  return { dirs, unscanned };
}


// Never staged: a mounted source is a whole CHECKOUT, so a plain copy drags in
// its version history and its dependencies. `.git` alone is hundreds of
// megabytes, and it is the one directory guaranteed to hold every earlier
// revision of everything the content was ever cleaned of.
const NEVER_STAGE = new Set(['.git', 'node_modules', '.stage', '.turbo', 'dist']);

function copyTree(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (NEVER_STAGE.has(e.name)) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    let st: fs.Stats;
    try { st = fs.statSync(from); } catch { continue; }   // dangling link: skip
    if (st.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}


function main(argv: string[]): number {
  const contentIdx = argv.indexOf('--content');
  const dir = contentIdx >= 0 ? argv[contentIdx + 1] : './content';
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : null;
  const check = argv.includes('--check');
  if (outDir && check) {
    console.error('resolveCorpusRefs: --out and --check are alternatives');
    return 1;
  }
  const files: string[] = [];
  // FOLLOW SYMLINKED DIRECTORIES. A content tree mounts other repositories by
  // symlink, and `isDirectory()` is FALSE for a symlink -- so the plain form
  // walks straight past a mounted course and reports "0 files with references",
  // which reads exactly like a clean tree. Stat through the link instead.
  let seenDirs = new Set<string>();
  const walk = (d: string) => {
    const real = fs.realpathSync(d);
    if (seenDirs.has(real)) return;        // a symlink loop is not an error here
    seenDirs.add(real);
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        try { isDir = fs.statSync(p).isDirectory(); } catch { continue; }
      }
      if (isDir) walk(p);
      else if (e.name.endsWith('.olx')) files.push(p);
    }
  };
  if (!fs.existsSync(dir)) {
    console.error(`resolveCorpusRefs: no content directory at ${dir}`);
    return 1;
  }
  walk(dir);
  // In --check mode the configured sources are scanned TOO, so a tree with
  // nothing mounted cannot pass by looking at nothing.
  let unscanned: string[] = [];
  if (check) {
    const roots = contentRoots(process.cwd());
    unscanned = roots.unscanned;
    for (const r of roots.dirs) {
      if (path.resolve(r) === path.resolve(dir)) continue;
      walk(r);
    }
  }
  // STAGE FIRST, so the authoring tree is never the thing being rewritten. The
  // whole tree is copied, not only the files carrying references, because the
  // build reads a content DIRECTORY and a partial copy would silently drop
  // every file that happened to have no reference in it.
  if (outDir) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    // STAGE WHAT THE SERVER SERVES, NOT ONLY THE FALLBACK.
    //
    // `./content` is the FALLBACK source -- demos and transitional content.
    // Real content is MOUNTED: content-sources.yaml mounts each source at its
    // key, and that key is the path prefix an activity appears under
    // (`edu.memphis.psych/bmod_handout1`). Staging only `dir` therefore staged
    // the demos and silently omitted every mounted course.
    //
    // That made the two modes disagree about what "the content" is: `--check`
    // already scans the mounted sources, explicitly so that "a tree with
    // nothing mounted cannot pass by looking at nothing". Staging did not, so a
    // reference in a mounted course was never resolved by the build, and
    // `.stage/content` could be spotless while saying nothing about it.
    //
    // Each source is staged under its MOUNT, which is what makes the staged ids
    // match the served ones.
    {
      const staged = contentRoots(process.cwd());
      const localCfg = path.join(process.cwd(), 'config/content-sources.local.yaml');
      const baseCfg = path.join(process.cwd(), 'config/content-sources.yaml');
      const cfgPath = fs.existsSync(localCfg) ? localCfg : baseCfg;
      let cfg: any = {};
      try { cfg = YAML.parse(fs.readFileSync(cfgPath, 'utf8')) || {}; } catch { cfg = {}; }
      for (const [mount, val] of Object.entries(cfg.sources || {})) {
        if (typeof val !== 'string') continue;          // repo form: reported below
        const src = path.isAbsolute(val) ? val : path.join(process.cwd(), val);
        if (!fs.existsSync(src)) continue;              // already reported as unscanned
        if (path.resolve(src) === path.resolve(dir)) continue;
        copyTree(src, path.join(outDir, mount));
        console.error(`resolveCorpusRefs: staged mounted source ${mount} from ${src}`);
      }
      // A SOURCE THAT CANNOT BE STAGED MUST SAY SO. A git-remote source is not
      // on disk here, so the staged tree does not contain it and nothing in it
      // has been resolved. Silence would read as "there was nothing to do".
      for (const u of staged.unscanned) {
        console.error(`resolveCorpusRefs: NOT STAGED -- ${u}`);
      }
    }
    // DEREFERENCE. A content tree mounts other repositories by symlink, and a
    // plain copy reproduces the LINK -- so the "staged" tree points back at the
    // authoring checkout and resolving in it writes through to the source, which
    // is the one outcome staging exists to prevent. Copy what the links point
    // at, so the staged tree is genuinely separate.
    copyTree(dir, outDir);
    files.length = 0;
    // A FRESH loop-guard. The first walk recorded the REAL paths behind the
    // mounts; carrying them into the staged walk makes every mounted course
    // look already-visited and the staged tree come back empty -- reported as
    // "0 files with references", which is what a clean tree also looks like.
    seenDirs = new Set<string>();
    walk(outDir);
  }
  let touched = 0;
  for (const f of files) {
    const olx = fs.readFileSync(f, 'utf8');
    CORPUS_REF.lastIndex = 0;
    if (!CORPUS_REF.test(olx)) continue;
    const dataPath = corpusDataPath(olx);
    if (!dataPath) {
      console.error(
        `${f}: carries {{corpus:...}} references and no \`corpus_data:\` in its ` +
        `frontmatter, so the build cannot know where the spans live.`);
      return 1;
    }
    if (!fs.existsSync(dataPath)) {
      console.error(`${f}: corpus_data points at ${dataPath}, which does not exist.`);
      return 1;
    }
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    let out: string;
    try {
      out = resolve(olx, data, f);
    } catch (e) {
      console.error(String((e as Error).message));
      return 1;
    }
    touched++;
    if (check) {
      console.error(`${f}: ${(olx.match(CORPUS_REF) || []).length} reference(s) resolve`);
    } else {
      fs.writeFileSync(f, out);
      console.error(`${f}: resolved`);
    }
  }
  console.error(`resolveCorpusRefs: ${touched} file(s) with references`
                + (check ? ` across ${files.length} .olx in ${seenDirs.size} dir(s)` : ''));
  for (const u of unscanned) {
    console.error(`resolveCorpusRefs: UNSCANNED source -- ${u}`);
  }
  if (check && unscanned.length) {
    console.error(
      `resolveCorpusRefs: ${unscanned.length} configured source(s) could not be ` +
      `read from here. This is not a clean result; it is an unchecked one.`);
  }
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('resolveCorpusRefs.ts')) {
  process.exit(main(process.argv.slice(2)));
}
