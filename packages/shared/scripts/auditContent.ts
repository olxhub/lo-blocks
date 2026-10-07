#!/usr/bin/env tsx
/**
 * The enforcement audit, as much of it as TypeScript can run, at build time.
 *
 * WARNINGS, NEVER ERRORS, on the user's instruction of 2026-09-27. A build that
 * fails on a scoring-model finding stops someone shipping a page over a
 * question about a rubric, and the two concerns are not the same. This prints
 * what it found and exits 0.
 *
 * ONLY WHERE A RUBRIC EXISTS -- also the user's instruction, and the gate is
 * `rubricFile(ns)`. A mounted namespace with no rubric is SKIPPED SILENTLY, not
 * warned about: a plain lo-blocks checkout, a demo collection, or CI with no
 * course content has nothing to audit and should say nothing. A tree where no
 * mounted course has a rubric prints one line and exits.
 *
 * IT SAYS WHAT IT COULD NOT CHECK. Two rules have no native assembler, and the
 * python audit carries many more that need the measurement ledger, the graders'
 * workbooks, or a live model. Reporting only the rules that ran would make this
 * look like the whole audit; a check that cannot run is not a check that
 * passed, which is the failure this project has paid for repeatedly.
 */
import { RULES } from '../lib/llm/enforce/index';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assemblerFor } from '../lib/llm/enforce/native';
import { loBlocksRoot, rubricFiles, withRubric } from '../lib/llm/enforce/courseData';
import { readdirSync } from 'fs';
import { basename, join } from 'path';

type Result = { rule: string; findings: string[] };

/** Every namespace mounted under `content/`, whether or not it has a rubric. */
function mountedNamespaces(): string[] {
  const root = loBlocksRoot();
  if (!root) return [];
  try {
    return readdirSync(join(root, 'content'), { withFileTypes: true })
      .filter(d => d.isDirectory() || d.isSymbolicLink())
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

function auditNamespace(ns: string):
    { ran: Result[]; advisory: Result[]; refused: string[] } {
  const ran: Result[] = [];
  // FINDINGS FROM AN UNCLEARED ASSEMBLER ARE REPORTED SEPARATELY, not dropped.
  // `assemblerFor` is the gate the runner uses too; the runner REFUSES what is
  // uncleared because its caller is the audit of record, and this one runs it
  // and labels it, because a refusal is information. What must not happen is
  // the build being SILENTLY more permissive than the bridge, which is what it
  // was: it keyed off the assembler table alone.
  const advisory: Result[] = [];
  const refused: string[] = [];
  for (const rule of Object.keys(RULES).sort()) {
    const { fn: assemble, cleared } = assemblerFor(rule);
    if (!assemble) {
      refused.push(`${rule}: no native assembler -- this rule is only reachable `
                 + `from the python audit, which supplies its payload`);
      continue;
    }
    let payload: unknown;
    try {
      payload = assemble(ns);
    } catch (e) {
      // A REFUSAL IS NOT A PASS. An assembler that throws has told us nothing
      // about the tree, and printing nothing would read as "this rule holds".
      refused.push(`${rule}: its assembler could not read the tree -- `
                 + `${(e as Error)?.message ?? String(e)}`);
      continue;
    }
    try {
      const findings = (RULES as Record<string, (p: unknown) => string[]>)[rule](payload) ?? [];
      if (findings.length) (cleared ? ran : advisory).push({ rule, findings });
    } catch (e) {
      refused.push(`${rule}: the rule itself threw -- ${(e as Error)?.message ?? String(e)}`);
    }
  }
  return { ran, advisory, refused };
}

/**
 * The recorded finding count per rule, per namespace.
 *
 * COUNTS, NOT TEXT. Finding messages are prose and get improved; keying the
 * baseline on text would make every wording change a baseline edit, and a
 * baseline that is edited constantly stops being read.
 *
 * IT LIVES IN LO-BLOCKS, NOT IN THE COURSE. The first version put it beside the
 * rubric's other records under `course_data/`, and git refused to add it: that
 * tree is gitignored wholesale, with only each rubric's `authored` subtree
 * negated back in. The files already tracked there predate the rule.
 *
 * Adding another negation would have GROWN a concession that is already
 * temporary -- refactor step L brings proper archiving of course_data, and the
 * records tracked there now have to be revisited then. So this baseline is kept
 * where it belongs anyway: it describes what THIS AUDIT can check, the audit is
 * lo-blocks', and one lo-blocks may hold baselines for several mounted courses.
 */
/**
 * PER RUBRIC WHEN THERE ARE SEVERAL, per namespace when there is one.
 *
 * A course with two rubrics has two sets of findings, and one record keyed only
 * by namespace would hold whichever ran last -- every run would then read as a
 * regression against the other rubric. A course with one rubric keeps the file
 * it already has: renaming those would be a diff over every baseline in the
 * tree to express a distinction the tree does not yet make.
 */
function baselinePath(ns: string, rubric?: string): string {
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'audit-baselines');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const several = rubric && rubricFiles(ns).length > 1;
  const stem = several ? `${ns}__${basename(rubric!).replace(/\.olx$/, '')}` : ns;
  return join(dir, `${stem}.json`);
}

type Baseline = { rules: Record<string, number>; refusedThen?: string[] };

function readBaseline(ns: string, rubric?: string): Baseline | null {
  const p = baselinePath(ns, rubric);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Baseline;
  } catch {
    return null;
  }
}

/**
 * Compare this run against the recorded one.
 *
 * FAIL ON NEW, NOT ON ANY. Failing on the whole standing backlog would break
 * `npm run build` on day one for findings nobody has triaged, and the
 * predictable response is to drop the audit from the build chain -- strictly
 * worse than an advisory audit. So the line is: it may not get worse.
 *
 * A REFUSAL IS NOT A RESOLUTION. A rule that had findings in the baseline and
 * cannot be assembled now has not been fixed; its findings have merely become
 * unreachable. Without this arm, BREAKING an assembler would be a way to make
 * its findings disappear and the build go green -- the same shape as a skip
 * being read as a pass.
 */
function compareToBaseline(
  ns: string, ran: Result[], refused: string[], rubric?: string,
): { failures: string[]; improved: string[] } {
  const base = readBaseline(ns, rubric);
  const failures: string[] = [];
  const improved: string[] = [];
  if (!base) return { failures, improved };

  const now: Record<string, number> = {};
  for (const r of ran) now[r.rule] = r.findings.length;

  const refusedNow = new Set(refused.map(w => w.split(':')[0]));
  for (const [rule, was] of Object.entries(base.rules ?? {})) {
    const is = now[rule] ?? 0;
    if (refusedNow.has(rule) && was > 0) {
      failures.push(
        `${rule}: had ${was} finding(s) in the baseline and cannot be checked `
        + `now. A refusal is not a resolution -- the findings are unreachable, `
        + `not fixed.`);
      continue;
    }
    if (is > was) failures.push(`${rule}: ${was} -> ${is} finding(s)`);
    else if (is < was) improved.push(`${rule}: ${was} -> ${is} finding(s)`);
  }
  for (const [rule, is] of Object.entries(now)) {
    if (!(rule in (base.rules ?? {})) && is > 0) {
      failures.push(`${rule}: ${is} finding(s), not in the baseline at all`);
    }
  }
  return { failures, improved };
}

function writeBaseline(ns: string, ran: Result[], refused: string[],
                       rubric?: string): void {
  const rules: Record<string, number> = {};
  for (const r of ran) rules[r.rule] = r.findings.length;
  writeFileSync(baselinePath(ns, rubric),
    JSON.stringify({ rules, refusedThen: refused.map(w => w.split(':')[0]).sort() },
      null, 1) + '\n', 'utf8');
  console.log(`  baseline written: ${Object.keys(rules).length} rule(s) with findings`);
}

function main(): number {
  // `--baseline` REWRITES THE RECORD, and it is deliberately a separate,
  // explicit act. A gate that re-baselines itself whenever it disagrees with
  // its record is the ratchet failure QUALITY_CONTROL §5 warns about: the
  // entries outlive their reason and nobody ever sees the diff.
  const rewriting = process.argv.includes('--baseline');
  const namespaces = mountedNamespaces();
  // ONE PASS PER RUBRIC, not per namespace. A course may carry several, and each
  // has its own items, its own gold and its own store directory -- so each is a
  // separate subject to audit, not a part of one bigger one. Auditing the
  // namespace meant auditing whichever rubric `rubricFile` happened to answer
  // with, and when there were two it refused rather than answered at all.
  const passes = namespaces.flatMap(ns => rubricFiles(ns).map(file => ({ ns, file })));

  if (!passes.length) {
    // Nothing to say. A tree with no rubric is not a tree with a problem.
    console.log('audit: no mounted course carries a rubric; nothing to audit.');
    return 0;
  }

  let totalFindings = 0;
  let regressions = 0;
  for (const { ns, file } of passes) {
    const several = rubricFiles(ns).length > 1;
    const { ran, advisory, refused } = withRubric(ns, file, () => auditNamespace(ns));
    const count = ran.reduce((n, r) => n + r.findings.length, 0);
    totalFindings += count;

    console.log(`\naudit: ${ns}`
              + (several ? `  [${basename(file).replace(/\.olx$/, '')}]` : ''));
    for (const r of ran) {
      for (const f of r.findings) console.log(`  warning  ${r.rule}: ${f}`);
    }
    if (advisory.length) {
      console.log(`  -- ${advisory.length} rule(s) ran with an assembler NOT `
                + `cleared against python's payload. Their findings may be `
                + `about the assembler rather than the tree:`);
      for (const r of advisory) {
        for (const f of r.findings) console.log(`     advisory  ${r.rule}: ${f}`);
      }
    }
    if (refused.length) {
      console.log(`  -- ${refused.length} rule(s) could NOT be checked here:`);
      for (const why of refused) console.log(`     ${why}`);
    }
    const checked = Object.keys(RULES).length - refused.length;
    console.log(`  ${checked} rule(s) checked, ${count} finding(s), `
              + `${refused.length} not checkable in this context.`);

    if (rewriting) {
      writeBaseline(ns, ran, refused, file);
      continue;
    }
    const { failures, improved } = compareToBaseline(ns, ran, refused, file);
    if (improved.length) {
      console.log(`  ${improved.length} rule(s) IMPROVED since the baseline:`);
      for (const line of improved) console.log(`     ${line}`);
      console.log('     Re-record with `npm run audit:baseline` so the gain is held.');
    }
    if (failures.length) {
      regressions += failures.length;
      console.log(`  ${failures.length} REGRESSION(S) against the baseline:`);
      for (const line of failures) console.log(`     ${line}`);
    }
  }

  // THE PYTHON AUDIT IS STILL THE AUDIT. This runs the rules whose judgement
  // lives here; the measurement ledger, the graders' workbooks and the live
  // model are not reachable from a build, and the checks that read them are
  // not represented above at all.
  console.log(`\naudit: ${totalFindings} warning(s) across ${passes.length} `
            + `course(s). This is the TypeScript-reachable subset of the `
            + `enforcement audit, not the whole of it.`);

  // EXIT 0 FROM THE WRONG COMMAND WAS REPORTED AS A CLEAN GATE more than once
  // in this project (QUALITY_CONTROL QC.0), and this step returned 0 on every
  // path -- a test that cannot fail reads exactly like a test that keeps
  // passing (§6a). It now fails on REGRESSIONS ONLY, so the standing backlog
  // does not block a build while a new finding does.
  if (regressions) {
    console.log(`audit: ${regressions} regression(s) against the recorded `
              + `baseline. Fix them, or re-record deliberately with `
              + `\`npm run audit:baseline\` so the change is reviewable.`);
    return 1;
  }
  return 0;
}

process.exit(main());
