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
import { courseDir } from '../lib/llm/enforce/courseData';

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

/**
 * The `corpus_data:` path from an .olx's frontmatter, with $VARS expanded.
 *
 * ENVIRONMENT FIRST, THEN THE COURSE'S OWN DECLARATION -- which is python's
 * precedence (`paths._course_root`), and this had only the first half. A
 * course that declares `course_data:` in its rubric rather than exporting a
 * variable is the arrangement the project is moving to, and on 2026-09-26 the
 * dry run became the first tree to use it: every handout here says
 * `corpus_data: $COURSE_DATA/corpus_refs.json`, the variable was deliberately
 * unset, and the build died on a course that had in fact said where its data
 * was. Reading the declaration is not a new mechanism -- `courseDir` is the
 * same reader the enforce checks use.
 *
 * STILL THROWS WHEN NEITHER ANSWERS, because a corpus path that silently
 * resolves to nothing produces a build with every reference unresolved, and
 * that looks like a tree with no references at all.
 */
export function corpusDataPath(olx: string, ns?: string): string | null {
  const head = olx.slice(0, 4000);
  const m = head.match(/^\s*corpus_data:\s*(\S+)\s*$/m);
  if (!m) return null;
  return m[1].replace(/\$([A-Z_][A-Z0-9_]*)/g, (_all, name) => {
    const v = process.env[name] || declaredRoot(name, ns);
    if (!v) throw new Error(
      `resolveCorpusRefs: ${name} is not set and no course declares it ` +
      `(namespace ${ns ?? '<not supplied>'}), and corpus_data needs it to ` +
      `find the referenced spans. Set it to the corpus directory, or declare ` +
      `it in the rubric's frontmatter.`);
    return v;
  });
}

/** What a course declares for `COURSE_DATA` / `COURSE_METADATA`, or ''. */
function declaredRoot(name: string, ns?: string): string {
  if (name !== 'COURSE_DATA' && name !== 'COURSE_METADATA') return '';
  if (!ns) return '';
  try {
    return courseDir(name as 'COURSE_DATA' | 'COURSE_METADATA', ns) || '';
  } catch {
    // The reader REFUSES when nothing declares the root and no variable is
    // set, which is the same answer as '' here -- the caller then throws with
    // the message that names both ways to fix it. (It was `require` at first,
    // which is simply absent in an ES module: the call threw, the catch ate
    // it, and the fallback reported "no course declares it" about a course
    // that does. A lazy import to avoid a hard dependency is not worth a
    // silent wrong answer.)
    return '';
  }
}

/**
 * Which mounted course a file belongs to, or undefined.
 *
 * NOT `relative(contentRoot, file)`. The walk collects from the tree it was
 * given AND from the mounted sources it dereferences, so a file is often not
 * under the directory named on the command line at all -- `relative()` then
 * returns a path beginning `..` and its first segment is a namespace no course
 * has. That reported "no course declares it" about a course that does, which
 * is the failure mode this whole fallback exists to avoid.
 *
 * ASK THE MOUNTS INSTEAD. `content/<ns>` is how a course is mounted,
 * `<staged>/<ns>` is how it is staged, and `<out>/<ns>` is where this script
 * writes what it resolved -- it walks its OWN OUTPUT, which is the root that
 * was missing when this was first written. A file belongs to whichever of
 * those real roots contains it; longest match wins, so a nested mount cannot
 * be shadowed by the tree that holds it.
 */
function namespaceOf(file: string, ...roots: (string | null)[]): string | undefined {
  const real = (p: string) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const target = real(file);
  let best: { ns: string; len: number } | undefined;
  const candidates = ['content', ...roots.filter(Boolean) as string[]];
  for (const root of candidates.map(r => path.resolve(r))) {
    let entries: string[];
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const ns of entries) {
      const base = real(path.join(root, ns));
      if (target === base || target.startsWith(base + path.sep)) {
        if (!best || base.length > best.len) best = { ns, len: base.length };
      }
    }
  }
  return best?.ns;
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
//
// `scoring` IS A PACKAGE, NOT CONTENT, and it is excluded for the same reason
// scaled down: it is 170 files of Python that this build cannot run, and since
// the history rewrite it carries corpus REFERENCES in its data files --
// PROSE_SPLIT_WORKSHEET.json alone holds 28. `resolveCorpusRefs` resolves .olx
// and nothing else, by design, so those references reach the staged page with no
// resolver behind them: the page ends up holding placeholder text where a
// developer note used to be. Measured 2026-09-21, after the psych rewrite
// landed: 3 staged files, 100 unresolved references, none of them renderable.
//
// THE ALTERNATIVE IS WORSE. Teaching the resolver to cover .json would expand a
// student's sentence INTO an artifact that currently holds only an opaque
// reference -- the rewrite's purpose, run backwards.
// `courses` AND `migration` GO FOR THE SAME REASON. `courses/<id>/course.json` is
// the rubric OF RECORD -- the destination of the Stage 5 migration, read by the
// Python package out of the repository and never fetched as a page. It is also
// the largest single carrier of unresolved placeholders in the stage: 65 of them.
// `migration/` is stage scripts and their notes. Neither renders; both were
// staged only because a mounted source is copied whole.
//
// WHAT IS LEFT IS CONTENT AND ITS DOCUMENTATION -- `psychology/`, `lo.yaml`, the
// licence and the plans. That is the line: if a build resolves .olx and serves
// pages, the stage should carry what becomes a page.
/**
 * WHAT IS NOT CONTENT, and the ONE list that says so.
 *
 * Staging copies a mounted source wholesale, so anything a course keeps beside
 * its .olx that is not content must be named here. The list excludes by top-level
 * NAME and POSITION -- never by what a file holds -- so a directory is protected
 * because of where it sits, and a file nested inside `psychology/` is under no
 * name this can see.
 *
 * EXPORTED BECAUSE IT WAS DUPLICATED. `materialiseRubrics` carried its own
 * identical copy as `NEVER_COPY`, which is exactly the divergence `stageSources`
 * below was written to prevent -- its docstring says "a second copy of the
 * mounting rule is how the two would come to disagree about what the content is",
 * and the rule's own exclusion set was the second copy. Adding `course_metadata`
 * to one of them fixed nothing: the mount is staged by THIS one.
 */
export const NEVER_STAGE = new Set(['.git', 'node_modules', '.stage', '.turbo',
                                    'dist', 'scoring', 'courses', 'migration',
                                    'course_metadata',
                                    // `course_data` IS THE DATA STORE, and a
                                    // course may now keep its own inside the
                                    // repository (declared as `course_data:`,
                                    // gitignored) so that it cannot collide
                                    // with another tree's. It holds gold,
                                    // submissions and the reconstructed
                                    // response fixtures: student writing keyed
                                    // by participant, which must never be
                                    // copied into a tree the site is built
                                    // from. Measured 2026-09-26: the walk
                                    // descended it and created 983 empty
                                    // directories, copying no file only
                                    // because `MOUNT_FILES` happens not to
                                    // name any of them -- protection by
                                    // coincidence, one filename away from
                                    // being none.
                                    'course_data',
                                    // `scorers` AND `fixture` HOLD PYTHON, and
                                    // were staged only because a mounted source
                                    // is copied whole. `scorers/` is this
                                    // course's scoring package -- the new home
                                    // for course python, created 2026-09-26 --
                                    // and `fixture/` holds the segmenter. Both
                                    // are read by the Python package OUT OF THE
                                    // REPOSITORY (`paths.roots().scorers`,
                                    // `.fixture`) and neither is ever fetched
                                    // as a page; measured, nothing reads either
                                    // one from the stage. They also dragged
                                    // `__pycache__/*.pyc` in behind them, which
                                    // this list cannot exclude on its own
                                    // because it excludes by TOP-LEVEL name and
                                    // a `__pycache__` sits one level down.
                                    'scorers', 'fixture']);

/**
 * Copy every MOUNTED source into `outDir` under its mount name.
 *
 * STAGE WHAT THE SERVER SERVES, NOT ONLY THE FALLBACK. `./content` is the
 * FALLBACK source -- demos and transitional content. Real content is MOUNTED:
 * content-sources.yaml mounts each source at its key, and that key is the path
 * prefix an activity appears under. Staging only the fallback staged the demos
 * and silently omitted every mounted course, so a reference in one was never
 * resolved and `.stage/content` could be spotless while saying nothing about it.
 *
 * EXPORTED BECAUSE TWO BUILD STEPS STAGE. `materialiseRubrics` produces the
 * expanded-but-unresolved tree and needs exactly this set of files; a second
 * copy of the mounting rule is how the two would come to disagree about what
 * "the content" is, which is the disagreement this function was written to end.
 */
export function stageSources(fallbackDir: string, outDir: string, who: string): void {
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
    if (path.resolve(src) === path.resolve(fallbackDir)) continue;
    copyTree(src, path.join(outDir, mount));
    console.error(`${who}: staged mounted source ${mount} from ${src}`);
  }
  // A SOURCE THAT CANNOT BE STAGED MUST SAY SO. A git-remote source is not on
  // disk here, so the staged tree does not contain it and nothing in it has been
  // resolved. Silence would read as "there was nothing to do".
  for (const u of staged.unscanned) console.error(`${who}: NOT STAGED -- ${u}`);
}


/**
 * WHAT THE STAGE IS FOR: the CONTENT COLLECTION, and the mount metadata.
 *
 * The stage holds OLX with templates expanded and references resolved. Its only
 * consumer is `xml2json`, which loads the content tree and emits
 * `all.json`/`activities.json`/`manifest.json`.
 *
 * IT WAS A DENY-LIST, AND A DENY-LIST STAGES EVERY NEW DIRECTORY BY DEFAULT.
 * That failed silently twice: `course_metadata` had to be added after the fact,
 * and `scorers/` -- this course's python, created 2026-09-26 -- was copied into
 * the build tree with `fixture/` and three `__pycache__/*.pyc` until somebody
 * looked. Measured before this change: 8.3 MB staged, 7.0 MB of it never
 * reaching a page, most of it planning documents.
 *
 * ENUMERATING EXTENSIONS IS THE WRONG AXIS, and trying it proved the point: an
 * allow-list of `.olx` failed the build on 28 missing files, adding `.mmd`,
 * `.cast`, `.json` and `.textSelectionpeg` left 14, inheriting content-ness
 * into asset subdirectories left 2, and the next was `.liquid`. Every asset
 * kind an author invents would be another build failure and another entry here.
 *
 * SO THE UNIT IS THE COLLECTION. A course's content lives in ONE directory --
 * the one holding `manifest.yaml`, which is also the one holding the `.olx` --
 * and everything under it is content by construction: templates, diagrams,
 * casts, grammars, images, whatever comes next. Stage that subtree whole, plus
 * the mount metadata beside it, and nothing else.
 *
 * BY SHAPE, NOT BY NAME. The collection is found by looking for its manifest,
 * never by spelling `psychology` -- the engine must not know one course's
 * directory names, which is what `manifest.yaml` exists to end.
 */
const MOUNT_FILES = new Set(['lo.yaml', '.lo-blocks', '.lo-server',
                             'static.config.json']);

/** Is this directory a content collection root? */
export function isCollectionRoot(dir: string): boolean {
  try {
    if (fs.existsSync(path.join(dir, 'manifest.yaml'))) return true;
    return fs.readdirSync(dir, { withFileTypes: true }).some(
      e => !e.isDirectory() && path.extname(e.name).toLowerCase() === '.olx');
  } catch { return false; }
}

/**
 * Copy a mounted source, keeping only its content collections.
 *
 * `inCollection` is set once the walk enters a collection root and then
 * everything below is copied; above it, only the mount metadata is.
 */
export function copyTree(src: string, dest: string, inCollection = false): void {
  const here = inCollection || isCollectionRoot(src);
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (NEVER_STAGE.has(e.name)) continue;
    // A RUBRIC'S QC DIRECTORY IS NOT CONTENT. `<rubric id>_qc/` holds the
    // quality-control documents -- the goal ledger, the backlog, the override
    // log, the approved closures, the guides -- which are ABOUT the course and
    // are never fetched as a page. Staged, they reached `.stage/content` and
    // the built page: 3.4 MB of override log, and an approvals record that
    // tripped the unresolved-reference check because a JSON note looked like a
    // corpus reference. Matched by suffix rather than by name, because the
    // directory is named for whichever rubric owns it.
    if (e.isDirectory() && e.name.endsWith('_qc')) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    let st: fs.Stats;
    try { st = fs.statSync(from); } catch { continue; }   // dangling link: skip
    if (st.isDirectory()) { copyTree(from, to, here); continue; }
    if (!here && !MOUNT_FILES.has(e.name)) continue;
    // WRITE BESIDE, THEN RENAME. `copyFileSync` truncates the destination and
    // fills it, so a reader that opens the path mid-copy sees a SHORT file; and
    // the caller used to `rm -rf` the whole tree first, so it saw no file at
    // all. Rename within a directory is atomic, so every reader sees either the
    // complete old file or the complete new one, never a gap and never a
    // fragment.
    //
    // NOT HYPOTHETICAL. `check_the_forms_agree_with_the_assembler` shells out to
    // `npm run build:assemble-prompts`, which runs this -- and EVERY audit runs
    // that check. Under `--selftest` with 16 forked audits, sixteen rebuilds
    // raced each other and fifteen readers: two runs died on
    // `FileNotFoundError: .../bmod_rubric.olx` before one happened to win the
    // timing. Measured 2026-09-26.
    const tmp = `${to}.tmp-${process.pid}`;
    fs.copyFileSync(from, tmp);
    fs.renameSync(tmp, to);
  }
}


function main(argv: string[]): number {
  const contentIdx = argv.indexOf('--content');
  const dir = contentIdx >= 0 ? argv[contentIdx + 1] : './content';
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : null;
  const check = argv.includes('--check');
  // `--no-mount`: the input is ALREADY a staged tree. `materialiseRubrics` has
  // mounted the sources and expanded the rubrics in them, so mounting again here
  // would copy the unexpanded source straight over that work.
  const noMount = argv.includes('--no-mount');
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
    if (!noMount) stageSources(dir, outDir, 'resolveCorpusRefs');
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
    // THE NAMESPACE IS THE MOUNT THE FILE CAME THROUGH: `<content>/<ns>/...`.
    // Needed so a course that DECLARES its data root rather than exporting one
    // can be asked -- see `corpusDataPath`.
    const ns = namespaceOf(f, dir, outDir);
    // NAME THE FILE. `corpusDataPath` cannot: it is handed the text, not the
    // path. Every failure here is "which course is this and where is its
    // data", and an error that answers neither sends the reader hunting.
    let dataPath: string | null;
    try {
      dataPath = corpusDataPath(olx, ns);
    } catch (e: any) {
      console.error(`${f}: ${e?.message ?? e}`);
      return 1;
    }
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
