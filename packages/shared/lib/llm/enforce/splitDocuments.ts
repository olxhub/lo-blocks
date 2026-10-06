// THE DOCUMENTS THAT ARE SPLIT, and the list of record for both engines.
//
// A split document has a GENERIC half here, beside the rules it describes, and
// a COURSE half under the rubric it belongs to; `compose_docs` places the
// course's cases at the generic half's anchors and writes a composed copy that
// every reader opens.
//
// THE LIST LIVES HERE, on the user's instruction of 2026-09-27, because the
// generic halves do. Python reads it through the `split_documents` probe and
// caches the answer, exactly as `slot_vocab` reads the verdict vocabulary --
// and REFUSES rather than falling back, because a list that quietly reverts to
// a stale copy is how a document stops being checked while still looking
// checked.
//
// A SECOND COPY WOULD DRIFT SILENTLY. A document added on one side and not the
// other simply drops out of whichever reader did not hear about it, and the
// result reads as "nothing wrong with that document" rather than as "that
// document is no longer examined".
export const SPLIT_DOCUMENTS: readonly string[] = [
  'GOALS.md',
  'QUALITY_CONTROL.md',
  'EQUIVALENCE.md',
  'README.md',
];

// SPLIT DOCUMENTS DECLARED TO HAVE NO COURSE HALF, with the reason. Empty is
// the honest state: all four have one. An entry here says "the split moved
// nothing, deliberately" and stops that being confused with a half that is
// GONE -- two states that look identical from the filesystem.
export const NO_COURSE_HALF: Readonly<Record<string, string>> = {};
