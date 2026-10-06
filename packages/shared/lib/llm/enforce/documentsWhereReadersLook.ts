// A split document that is not where its readers look.
//
// Ported from `enforcement.check_every_document_is_where_its_readers_look`
// (goal K), which delegates to `compose_docs.missing`.
//
// MOVING A DOCUMENT BREAKS ITS READERS QUIETLY. A reader joins a name onto a
// directory, the path does not exist, and the well-behaved ones skip it -- so
// the record reads as EMPTY rather than as broken. Measured twice in one
// sitting: a written-record scan reported NO RECORD for every item after a
// ledger was split, while the composed document held hundreds of mentions; and
// a citation check would have stopped reading a backlog that cites dozens of
// subgoals, the moment it moved.
//
// AN ABSENT COURSE HALF IS DECLARED, NOT SNIFFED. "Nothing was split out yet"
// and "the half is gone and the composed document is quietly the generic one"
// are different states that look identical from here, so the first is declared
// and the second is reported.

export type DocumentPlacesPayload = {
  /** One entry per split document. */
  docs: Array<{
    name: string;
    /** Where the course half should be, and whether it is there. */
    specificPath: string;
    specificExists: boolean;
    /** Where every reader opens it, and whether that exists. */
    readerPath: string;
    readerExists: boolean;
    /** Declared as having no course half, with the reason. */
    declaredNoCourseHalf: boolean;
  }>;
};

export function documentsWhereReadersLook(p: DocumentPlacesPayload): string[] {
  const out: string[] = [];
  for (const d of p.docs ?? []) {
    if (!d.specificExists && !d.declaredNoCourseHalf) {
      out.push(
        `${d.name} is split here but has NO COURSE HALF at ${d.specificPath}, ` +
        `and its absence is not declared. Either the split moved nothing -- say ` +
        `so in NO_COURSE_HALF with the reason -- or the half is gone and the ` +
        `composed document is quietly the generic one`);
    }
    if (!d.readerExists) {
      out.push(
        `${d.name} is not at ${d.readerPath}, where its readers look. A reader ` +
        `that cannot find a document does not fail -- it reports an empty record`);
    }
  }
  return out;
}
