// The verdict tokens either side may use, in ONE place.
//
// Goal K. This was TWO places: `slotSheet.EXTRA_VERDICTS` (the web's, used by
// the scorer) and `slot_vocab.WEB_EXTRAS` (python's copy of it). Measured
// 2026-09-25 they were identical, and the python docstring said outright where
// it had been copied from -- a transcription with nothing checking it, the same
// shape as the `corpusDataPath` copy this package already deleted. The user's
// ruling: *"Obviously we only need to keep one copy."*
//
// SO PYTHON READS THIS. `slot_vocab` parses `KNOWN_VERDICTS` out of this file
// rather than restating it, and REFUSES if it cannot -- a vocabulary that
// silently falls back to a stale copy is how the scan stops recognising a
// token that is still in use.
//
// AND IT UNBLOCKS A RULE. `prompt_prose_names_only_offered_verdicts` needs this
// list, which is why it could be run from python and from nowhere else.

import { EXTRA_VERDICTS } from '../slotSheet';

/**
 * Verdicts a RUBRIC slot may declare, beyond the web's own extras.
 *
 * `not_active` is HISTORICAL and kept only so the scan still recognises it: no
 * rubric slot declares it any more. It was Q4b's failing verdict when the paper
 * scorer was told to answer `wrong_kind` while being offered met/absent/
 * not_active -- the incident this vocabulary exists because of -- and those
 * slots declare `wrong_kind` now. Removing it would stop the audit scanning for
 * a token that could still appear in an old rule.
 *
 * `not_antecedent`, `not_consequence` and `not_described` were MISSING until
 * 2026-08-30, and missing here means invisible: this list is what the scan
 * knows about, so a verdict absent from it cannot be found in a rule no matter
 * how often it appears. `unclear` was missing the same way while TWENTY-ONE
 * rubric slots declared it, across all three handouts.
 */
export const RUBRIC_EXTRAS = [
  'not_active', 'not_reason', 'duplicate', 'not_a_type',
  'not_antecedent', 'not_consequence', 'not_described',
  'wrong_kind',
  'unclear',
  // THE FOUR CONDITIONING TYPES are verdicts too: `observed_type` answers with
  // one of them. Transcribing the list without them would have dropped four
  // tokens from the scan, which is the failure mode this vocabulary documents
  // twice already -- missing here means invisible.
  'PR', 'NR', 'PP', 'NP',
] as const;

/**
 * Every verdict token either side may use.
 *
 * `met` and `absent` first, then the web's extras, then the rubric's -- exactly
 * python's tuple order. IT REPEATS: `duplicate`, `wrong_kind` and `unclear` are
 * in BOTH halves and appear twice, and the python tuple did the same. Collapsing
 * to a set here would be tidier and would stop the two sides being comparable
 * element by element, which is the only cheap way to see that they still agree.
 */
/**
 * Verdicts that HEDGE rather than judge, and are therefore exempt from pairing.
 *
 * `unclear` is what the web offers when a slot's evidence does not settle the
 * question. It is not a charge, so it needs no counterpart on the paper side --
 * and a vocabulary comparison that did not know this reports it as an
 * unexpressible verdict on every slot that offers it.
 *
 * IT LIVED IN `enforcement.py` AS A SET LITERAL, which made it the third
 * vocabulary this package had to keep in step by hand -- the exact position
 * `EXTRA_VERDICTS` was in before this file existed. `score.py` reads it too, so
 * it could not simply move; python reads it from HERE through the
 * `verdict_vocabulary` probe, the way `slot_vocab` already reads
 * `KNOWN_VERDICTS`.
 */
export const VERDICT_HEDGES: readonly string[] = ['unclear'];

export const KNOWN_VERDICTS: readonly string[] = [
  'met', 'absent', ...EXTRA_VERDICTS, ...RUBRIC_EXTRAS,
];
