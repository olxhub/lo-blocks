// Does the course component link the rubric AND every handout it scores?
//
// Ported from `enforcement.check_the_course_links_the_rubric_and_every_form`
// (goal K). Generic: "a course must assemble the parts it scores" says nothing
// about any subject -- the component, the rubric and the handouts arrive as
// names the collection declares.

export type CourseLinksPayload = {
  /** The course component's filename, for the finding. */
  courseOlx: string;
  /** Does that component exist at all? */
  exists: boolean;
  /** Its path relative to the repo, for the absence message. */
  relPath: string;
  /** Element ids the component actually `<Use ref=...>`s. */
  refs: string[];
  /** Element ids it must link: the rubric and every declared handout. */
  want: string[];
};

export function courseLinksEveryForm(p: CourseLinksPayload): string[] {
  if (!p?.exists) {
    return [`there is no ${p?.relPath ?? '?'}: the rubric and the three ` +
            `handouts are not assembled into a course at all`];
  }
  const refs = new Set(p.refs ?? []);
  const missing = (p.want ?? []).filter(w => !refs.has(w)).sort();
  if (missing.length) {
    return [`${p.courseOlx} does not link ${missing.join(', ')} -- the course ` +
            `must hold the rubric AND every handout it scores`];
  }
  return [];
}
