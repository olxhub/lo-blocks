// The paper column's prompt sha must be the PAPER prompt's.
//
// Ported from `enforcement.check_paper_prompt_is_stamped` (goal K), SPLIT:
// python computes the fingerprints and reads the recorded stamps, this judges.
//
// WHAT WENT WRONG, and why a borrowed stamp is worse than no stamp. The prompt
// fingerprint hashed the .olx section a WEB grader is served and had no paper
// branch, so it returned the web's hash for the paper side -- one item's paper
// and olx shas were the same twelve characters. Nothing the paper scorer alone
// decides was covered: not the answer inventory, not the desc+rule merge, not
// the verdict enums. All of those changed on one day, none moved a sha, and a
// clause shipped GLOBALLY for a day without staling a single paper column.
//
// A column stamped with the other side's hash does not read as unstamped. It
// reads as CURRENT, which is why both arms below are findings rather than one:
//
//   the two sides' shas being EQUAL means the paper stamp is borrowed, so a
//     paper-only prompt change will stale nothing;
//   a RECORDED paper column carrying the olx hash means that column cannot say
//     what produced it, and re-recording is the only way back.

export type PaperStampPayload = {
  items: Array<{
    item: string;
    /** The paper prompt could not be built at all: python's message. */
    fingerprintError?: string | null;
    /** The fingerprints themselves could not be computed: python's message. */
    shaError?: string | null;
    paperSha?: string | null;
    olxSha?: string | null;
    /** What each recorded paper-side column is stamped with. */
    recorded?: Array<{ side: string; promptSha: string | null }>;
  }>;
};

export function paperPromptStamped(p: PaperStampPayload): string[] {
  const out: string[] = [];
  for (const it of p?.items ?? []) {
    if (it.fingerprintError) {
      out.push(
        `${it.item}: score.fingerprint_text does not build ` +
        `(${it.fingerprintError}) -- the paper prompt cannot ` +
        `be stamped, so a paper sweep would record unstamped`);
      continue;
    }
    if (it.shaError) {
      out.push(`${it.item}: prompt_sha failed (${it.shaError})`);
      continue;
    }
    if (it.paperSha === it.olxSha) {
      out.push(
        `${it.item}: the paper and olx prompt shas are both ` +
        `${it.paperSha} -- the paper side is borrowing the web's ` +
        `stamp, so a paper-only prompt change stales nothing`);
    }
    for (const r of it.recorded ?? []) {
      if (r.promptSha && r.promptSha === it.olxSha) {
        out.push(
          `${it.item} [${r.side}]: recorded at prompt_sha ${it.olxSha}, ` +
          `which is the OLX side's current hash -- that ` +
          `column is stamped with the web's prompt and ` +
          `cannot say what produced it; re-record it`);
      }
    }
  }
  return out;
}
