// PrintAction - triggers the browser print dialog for PDF export.
//
// Usage:
//   <ActionButton label="Export as PDF">
//     <PrintAction />
//   </ActionButton>
//
// THE FILENAME. Browsers take the default "Save as PDF" filename from
// document.title, and there is no other hook — no API sets it directly. So
// this action retitles the document for the duration of the print and puts it
// back afterwards. Everything a submitted handout needs to be identifiable
// goes into that name:
//
//   PluckyLlama99_bmod_handout1_bmod_h1_print_btn_20260813-142530
//   └ who         └ which activity  └ which button   └ when
//
// Without it every student in a class saves "lo-blocks.pdf" and an instructor
// collecting them by LMS upload gets a folder of identical names. The button
// id is in there because one activity can have more than one print button —
// Handout 3 has a per-graph print alongside the final submission print — and
// two prints of the same handout should not be indistinguishable.
//
// RESTORING THE TITLE is deliberately NOT done right after window.print()
// returns. print() blocks until the dialog closes in current browsers, but
// that is not guaranteed, and restoring early would rename the file out from
// under a dialog that is still open — the exact failure this block exists to
// prevent. Restore on `afterprint`, which fires in every browser that
// implements printing, with a long timeout only as a leak guard.

import * as parsers from '@/lib/content/parsers';
import * as blocks from '@/lib/blocks';
import { getParents } from '@/lib/blocks/dynamicDom';
import { splitNs } from '@/lib/types/id-grammar';
import type { OlxDomNode, RuntimeProps } from '@/lib/types';

/** How long to wait for `afterprint` before putting the title back anyway. */
const TITLE_RESTORE_TIMEOUT_MS = 60_000;

/**
 * Filesystem-safe fragment. Everything outside [A-Za-z0-9._-] becomes a
 * hyphen, runs collapse, and edges are trimmed — a display name like
 * "Dr. Chen (she/her)" must not turn into a path or a shell surprise.
 */
export function sanitizeSegment(value: unknown): string {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/** Local time as YYYYMMDD-HHMMSS — sorts chronologically as a string. */
export function printTimestamp(now: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
    + `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** "edu.memphis.psych/bmod_handout1" → "bmod_handout1". */
export function leafId(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    return (splitNs(value as any).path as string) || value;
  } catch {
    return value;
  }
}

/** The authored id of a node, unnamespaced. */
function olxIdOf(node: OlxDomNode | undefined): string {
  if (!node) return '';
  const authored = node.olxJson?.attributes?.id;
  if (typeof authored === 'string' && authored) return authored;
  return leafId(node.olxJson?.id);
}

/** The activity a learner launched — the thing they will hand in. */
function isLaunchable(node: OlxDomNode): boolean {
  const flag = node.olxJson?.attributes?.launchable;
  return flag === true || flag === 'true';
}

/**
 * Build the download name: who, which activity, which button, when.
 *
 * Any part that cannot be determined is dropped rather than written as
 * "undefined" — a name with a hole in it is still usable, and a literal
 * "undefined" in a filename reads as a bug to whoever collects the file.
 */
export function printFileName(props: RuntimeProps, now?: Date): string {
  const state = props?.runtime?.store?.getState?.();
  const user = state?.application_state?.system?.currentUser;

  const button = props?.nodeInfo
    ? getParents(props.nodeInfo, { selector: (n: OlxDomNode) => n.loBlock?.name === 'ActionButton' })[0]
    : undefined;

  // The LAUNCHABLE activity, read from the content tree — not
  // runtime.activityId, which is whatever id the page was asked to render.
  // Those coincide on a real launch and diverge in preview, where rendering
  // one screen of Handout 1 would otherwise name the file after that screen
  // rather than the handout. Fall back to activityId (leaf only: it arrives
  // namespaced, and "edu.memphis.psych/…" is not filename material) so a
  // block outside any launchable still gets a name.
  const activity = props?.nodeInfo
    ? getParents(props.nodeInfo, { selector: isLaunchable })[0]
    : undefined;

  const parts = [
    sanitizeSegment(user?.user_id ?? user?.safe_user_id),
    sanitizeSegment(olxIdOf(activity) || leafId(props?.runtime?.activityId)),
    sanitizeSegment(olxIdOf(button)),
    printTimestamp(now),
  ].filter(Boolean);

  // Never return "": a browser given an empty title falls back to the URL,
  // which is worse than a bare timestamp.
  return parts.join('_') || printTimestamp(now);
}

async function printAction({ props }: { props: RuntimeProps }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const previousTitle = document.title;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle;
  };

  try {
    document.title = printFileName(props);
  } catch {
    // A name we could not build is not a reason to refuse to print.
    restore();
    window.print();
    return;
  }

  window.addEventListener('afterprint', restore, { once: true });
  const timer = setTimeout(restore, TITLE_RESTORE_TIMEOUT_MS);

  try {
    window.print();
  } finally {
    // print() throwing (blocked popup, headless quirk) must not strand the
    // document under a filename-shaped title.
    if (restored) clearTimeout(timer);
  }
}

const PrintAction = blocks.core({
  ...parsers.ignore(),
  ...blocks.action({
    action: printAction,
  }),
  name: 'PrintAction',
  description: 'Triggers the browser print dialog for PDF export',
  // Shared no-op renderer lives in layout/, not a sibling of this file.
  componentLoader: () => import('@/components/blocks/layout/_Noop').then(m => m.default),
});

export default PrintAction;
