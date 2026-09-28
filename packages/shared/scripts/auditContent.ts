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
import { assemblerFor } from '../lib/llm/enforce/native';
import { loBlocksRoot, rubricFile } from '../lib/llm/enforce/courseData';
import { readdirSync } from 'fs';
import { join } from 'path';

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

function main(): number {
  const namespaces = mountedNamespaces();
  const withRubric = namespaces.filter(ns => rubricFile(ns) !== null);

  if (!withRubric.length) {
    // Nothing to say. A tree with no rubric is not a tree with a problem.
    console.log('audit: no mounted course carries a rubric; nothing to audit.');
    return 0;
  }

  let totalFindings = 0;
  for (const ns of withRubric) {
    const { ran, advisory, refused } = auditNamespace(ns);
    const count = ran.reduce((n, r) => n + r.findings.length, 0);
    totalFindings += count;

    console.log(`\naudit: ${ns}`);
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
  }

  // THE PYTHON AUDIT IS STILL THE AUDIT. This runs the rules whose judgement
  // lives here; the measurement ledger, the graders' workbooks and the live
  // model are not reachable from a build, and the checks that read them are
  // not represented above at all.
  console.log(`\naudit: ${totalFindings} warning(s) across ${withRubric.length} `
            + `course(s). This is the TypeScript-reachable subset of the `
            + `enforcement audit, not the whole of it.`);
  return 0;
}

process.exit(main());
