// Did a `{{corpus:...}}` reference survive into what a student is served?
//
// Ported from `enforcement.check_no_unresolved_reference_reaches_the_page`
// (goal K). Generic: "a reference must be resolved before anybody sees it" is
// a statement about a build artefact, and the reference syntax is the engine's.
//
// THE GRAMMAR CHECKS TEST THE PARSERS. THIS TESTS THE ARTEFACT. When the two
// resolvers last diverged the build did not fail -- the regex simply did not
// match a reference carrying a shape, so the build reported "0 file(s) with
// references", passed, and would have copied a literal `{{corpus:...}}` onto
// the page. Only reading the built output makes that visible.
//
// THREE OUTCOMES, AND TWO OF THEM ARE NOT PASSES. An unresolved reference is
// the finding this exists for. But a build directory that is ABSENT means the
// page was never built, and one OLDER than the content it claims to render is
// not evidence about that content -- reporting either as clean is how a check
// becomes decoration.

export type BuiltRoot = {
  /** Path relative to the lo-blocks root, as the finding names it. */
  rel: string;
  /** What this artefact IS, in the finding's words. */
  what: string;
  exists: boolean;
  /** Newest mtime under it, epoch seconds; 0 when empty. */
  newestBuilt: number;
  /** Does it contain this repository's handouts at all? */
  containsOurs: boolean;
  /** Files holding a literal `{{corpus:` reference, relative to the root. */
  hits: string[];
};

export type BuiltPagePayload = {
  loExists: boolean;
  /** The lo-blocks root, for the finding that names it. */
  loPath: string;
  /** Newest mtime across the course's `.olx`, epoch seconds; 0 when none. */
  newestSrc: number;
  /** The collection directory's NAME, which the finding quotes. */
  olxDirName: string;
  /** `.olx` names in the course tree that `.stage/content` does not have. */
  missingFromStage: string[];
  /** Was `.stage/content` non-empty? An empty stage skips that finding. */
  stageHasNames: boolean;
  roots: BuiltRoot[];
};

export function noUnresolvedReferenceReachesThePage(p: BuiltPagePayload): string[] {
  if (!p?.loExists) {
    return [`$LO_BLOCKS does not exist (${p?.loPath}); the built page cannot be read, ` +
            `which is NOT the same as it being clean`];
  }
  const out: string[] = [];
  // WAS IT BUILT FROM *THIS* TREE? The mtime test below asks only whether the
  // artefacts are NEWER, which any rebuild from any source satisfies. Measured
  // 2026-09-20: artefacts rebuilt from a DIFFERENT tree became newer than this
  // one's `.olx` and the check fell silent. A green meaning "someone ran a
  // build somewhere" is worse than the finding it replaced.
  //
  // ONE DIRECTION ONLY. A staged file this tree lacks is ordinary -- the stage
  // carries demos and other courses. A file THIS TREE HAS and the stage does
  // not means the stage is not about this tree.
  if (p.stageHasNames && p.missingFromStage.length) {
    const m = p.missingFromStage;
    out.push(
      `.stage/content was built from a DIFFERENT content tree: ` +
      `${m.length} .olx file(s) in ${p.olxDirName}/ are absent ` +
      `from it (${m.slice(0, 3).join(', ')}${m.length > 3 ? ' ...' : ''}). Its age says nothing ` +
      `about this tree -- rebuild with lo-blocks pointed here, or ` +
      `read the finding as 'not evidence' rather than as clean.`);
  }
  for (const r of p.roots ?? []) {
    if (!r.exists) {
      out.push(`${r.rel} does not exist -- ${r.what} has never been built, so ` +
               `this check cannot see what a student would receive`);
      continue;
    }
    if (p.newestSrc && r.newestBuilt < p.newestSrc) {
      // PYTHON'S `{:.0f}`, which rounds half to EVEN -- `2.5` renders `2`.
      // JavaScript's `toFixed` rounds half away from zero and would print `3`,
      // one hour apart in a finding that a baseline diff compares literally.
      const hrs = (p.newestSrc - r.newestBuilt) / 3600;
      out.push(`${r.rel} is ${roundHalfEven(hrs)}h older than the newest .olx -- it is not ` +
               `evidence about the content this tree now holds; rebuild`);
    }
    // DOES THIS ARTEFACT EVEN CONTAIN OUR CONTENT? The resolver stages only
    // `./content`; a MOUNTED source -- which is how this repository's handouts
    // reach the engine -- is scanned in `--check` mode and NOT staged in
    // `--out` mode. So the stage can be spotless and say nothing whatever
    // about these handouts.
    if (!r.containsOurs) {
      out.push(`${r.rel} does not contain this repository's handouts at all ` +
               `-- it is ${r.what}, but not of OUR content, so it cannot ` +
               `show whether a reference of ours reached a page`);
      continue;
    }
    for (const h of (r.hits ?? []).slice(0, 8)) {
      out.push(`${r.rel}/${h} still holds a literal corpus reference -- it ` +
               `reached the page unresolved`);
    }
    if ((r.hits ?? []).length > 8) {
      out.push(`${r.rel}: and ${r.hits.length - 8} more file(s) with literal references`);
    }
  }
  return out;
}

/** Python's `{:.0f}`: round half to EVEN, not away from zero. */
function roundHalfEven(v: number): string {
  const f = Math.floor(v);
  const diff = v - f;
  if (Math.abs(diff - 0.5) > Number.EPSILON) return String(Math.round(v));
  return String(f % 2 === 0 ? f : f + 1);
}
